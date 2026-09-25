import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MemberStatus, PrismaService, Role, type PrismaClient } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { LIVE_STATUSES } from '../appointments/appointment-transitions.js';
import {
  freeSlots,
  isWithinWorkingHours,
  operatingHoursToRanges,
  overlaps,
  validateWeekly,
  type Interval,
  type WeeklyRange,
} from './availability.engine.js';
import { assertTimezone, instantAt, parseIsoDate } from './tz.js';
import type {
  CreateTimeOffDto,
  SetWeeklyScheduleDto,
  SlotsQueryDto,
} from './dto/availability.dto.js';

/** Roles that can carry appointments. Matches what the schedule UI offers. */
export const PROVIDER_ROLES: readonly Role[] = [
  Role.OWNER,
  Role.DOCTOR,
  Role.NURSE,
];

const DEFAULT_TZ = 'Asia/Manila';

/**
 * Provider availability: weekly rules + dated time off, and the two things
 * built on them — "is this slot bookable?" (used by AppointmentsService on
 * create / reschedule) and "what's free on this day?" (the slot picker and,
 * later, portal self-booking).
 *
 * Fallback ladder for a provider with no weekly rows:
 *   provider rules → tenant settings.operatingHours → unrestricted.
 * Time off applies regardless of which layer supplied the hours.
 */
@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── providers ──────────────────────────────────────────────────

  /** Bookable staff in the caller's tenant (for pickers). */
  async listProviders(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const rows = await tx.tenantUser.findMany({
        where: {
          tenantId: user.tenantId,
          status: MemberStatus.ACTIVE,
          role: { in: [...PROVIDER_ROLES] },
        },
        select: {
          role: true,
          user: {
            select: { id: true, name: true, email: true, prcSpecialty: true },
          },
        },
        orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
      });
      return rows.map((r) => ({
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        role: r.role,
        specialty: r.user.prcSpecialty,
      }));
    });
  }

  // ── read ───────────────────────────────────────────────────────

  async get(providerId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      await this.assertProvider(tx, providerId, user.tenantId);
      const [tenant, rules, timeOff] = await Promise.all([
        this.tenantHours(tx, user.tenantId),
        tx.providerAvailability.findMany({
          where: { tenantId: user.tenantId, providerId },
          orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
          select: {
            id: true,
            weekday: true,
            startTime: true,
            endTime: true,
            slotMinutes: true,
          },
        }),
        tx.providerTimeOff.findMany({
          where: {
            tenantId: user.tenantId,
            providerId,
            endsAt: { gte: new Date() },
          },
          orderBy: { startsAt: 'asc' },
          select: { id: true, startsAt: true, endsAt: true, reason: true },
        }),
      ]);
      return {
        providerId,
        timezone: tenant.timezone,
        /** 'provider' = own rules, 'clinic' = falling back to operating hours, 'none' = unrestricted */
        source:
          rules.length > 0
            ? 'provider'
            : tenant.ranges.length > 0
              ? 'clinic'
              : 'none',
        schedule: rules,
        clinicHours: tenant.ranges,
        timeOff,
      };
    });
  }

  // ── write ──────────────────────────────────────────────────────

  /**
   * Replace the weekly schedule. OWNER/ADMIN (TENANT_MANAGE at the route)
   * for anyone; a provider may also edit their own — the controller lets
   * self-edits through and this method re-checks.
   */
  async setWeekly(
    providerId: string,
    dto: SetWeeklyScheduleDto,
    user: AuthenticatedUser,
  ) {
    this.assertCanEdit(providerId, user);
    const problems = validateWeekly(dto.ranges);
    if (problems.length > 0) {
      throw new BadRequestException({ message: 'invalid schedule', problems });
    }
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      await this.assertProvider(tx, providerId, user.tenantId);
      await tx.providerAvailability.deleteMany({
        where: { tenantId: user.tenantId, providerId },
      });
      if (dto.ranges.length > 0) {
        await tx.providerAvailability.createMany({
          data: dto.ranges.map((r) => ({
            tenantId: user.tenantId,
            providerId,
            weekday: r.weekday,
            startTime: r.startTime,
            endTime: r.endTime,
            slotMinutes: r.slotMinutes ?? 30,
          })),
        });
      }
      this.logger.log(
        `weekly schedule for ${providerId} set to ${dto.ranges.length} range(s) by ${user.userId}`,
      );
      return tx.providerAvailability.findMany({
        where: { tenantId: user.tenantId, providerId },
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
        select: {
          id: true,
          weekday: true,
          startTime: true,
          endTime: true,
          slotMinutes: true,
        },
      });
    });
  }

  /**
   * Block a date range. Refused (409) if a live appointment already sits
   * inside it — the front desk has to move those first, deliberately,
   * rather than have them silently orphaned.
   */
  async addTimeOff(
    providerId: string,
    dto: CreateTimeOffDto,
    user: AuthenticatedUser,
  ) {
    this.assertCanEdit(providerId, user);
    if (dto.endsAt <= dto.startsAt)
      throw new BadRequestException('endsAt must be after startsAt');
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      await this.assertProvider(tx, providerId, user.tenantId);
      const clash = await tx.appointment.findMany({
        where: {
          providerId,
          deletedAt: null,
          status: { in: [...LIVE_STATUSES] },
          startsAt: { lt: dto.endsAt },
          endsAt: { gt: dto.startsAt },
        },
        select: { id: true, startsAt: true },
        take: 5,
      });
      if (clash.length > 0) {
        throw new ConflictException({
          message: `${clash.length} appointment(s) fall inside that time off — reschedule them first`,
          appointmentIds: clash.map((c) => c.id),
        });
      }
      return tx.providerTimeOff.create({
        data: {
          tenantId: user.tenantId,
          providerId,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
          reason: dto.reason ?? null,
          createdByUserId: user.userId,
        },
        select: { id: true, startsAt: true, endsAt: true, reason: true },
      });
    });
  }

  async removeTimeOff(
    providerId: string,
    timeOffId: string,
    user: AuthenticatedUser,
  ) {
    this.assertCanEdit(providerId, user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const res = await tx.providerTimeOff.deleteMany({
        where: { id: timeOffId, tenantId: user.tenantId, providerId },
      });
      if (res.count === 0) throw new NotFoundException('time off not found');
      return { removed: true, id: timeOffId };
    });
  }

  // ── queries used by booking ────────────────────────────────────

  /**
   * Free slots for one local day. Booked = live appointments; the caller's
   * own appointment can be excluded when rescheduling.
   */
  async slots(providerId: string, q: SlotsQueryDto, user: AuthenticatedUser) {
    let date: { year: number; month: number; day: number };
    try {
      date = parseIsoDate(q.date);
    } catch {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      await this.assertProvider(tx, providerId, user.tenantId);
      const { timezone, ranges } = await this.effectiveRanges(
        tx,
        providerId,
        user.tenantId,
      );
      // Day bounds in the tenant tz (generous: whole local day).
      const dayStart = instantAt(date.year, date.month, date.day, 0, timezone);
      const dayEnd = instantAt(
        date.year,
        date.month,
        date.day,
        24 * 60,
        timezone,
      );
      const [timeOff, booked] = await Promise.all([
        this.timeOffBetween(tx, providerId, user.tenantId, dayStart, dayEnd),
        tx.appointment.findMany({
          where: {
            providerId,
            deletedAt: null,
            status: { in: [...LIVE_STATUSES] },
            startsAt: { lt: dayEnd },
            endsAt: { gt: dayStart },
          },
          select: { startsAt: true, endsAt: true },
        }),
      ]);
      const list = freeSlots({
        date,
        tz: timezone,
        ranges,
        timeOff,
        booked,
        durationMinutes: q.durationMinutes,
      });
      return {
        providerId,
        date: q.date,
        timezone,
        unrestricted: ranges.length === 0,
        slots: list.map((s) => ({
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
        })),
      };
    });
  }

  /**
   * Is [startsAt, endsAt) bookable for this provider? Called inside the
   * appointment transaction so it sees the same rows. Returns the reason
   * when not — the caller decides whether `force` overrides it.
   */
  async checkSlot(
    tx: PrismaClient,
    tenantId: string,
    providerId: string,
    slot: Interval,
  ): Promise<
    | { ok: true }
    | { ok: false; reason: 'outside_hours' | 'time_off'; detail: string }
  > {
    const timeOff = await this.timeOffBetween(
      tx,
      providerId,
      tenantId,
      slot.startsAt,
      slot.endsAt,
    );
    const hit = timeOff.find((t) => overlaps(slot, t));
    if (hit) {
      return {
        ok: false,
        reason: 'time_off',
        detail: `provider is off ${hit.startsAt.toISOString()} – ${hit.endsAt.toISOString()}${hit.reason ? ` (${hit.reason})` : ''}`,
      };
    }
    const { timezone, ranges } = await this.effectiveRanges(
      tx,
      providerId,
      tenantId,
    );
    if (ranges.length === 0) return { ok: true }; // unrestricted
    const within = isWithinWorkingHours(slot, ranges, timezone);
    if (!within.ok)
      return { ok: false, reason: 'outside_hours', detail: within.detail };
    return { ok: true };
  }

  // ── helpers ────────────────────────────────────────────────────

  private assertCanEdit(providerId: string, user: AuthenticatedUser) {
    const manager = user.role === Role.OWNER || user.role === Role.ADMIN;
    if (!manager && providerId !== user.userId) {
      throw new ForbiddenException(
        "only owners/admins can edit another provider's availability",
      );
    }
  }

  private async assertProvider(
    tx: PrismaClient,
    providerId: string,
    tenantId: string,
  ) {
    const member = await tx.tenantUser.findFirst({
      where: { tenantId, userId: providerId, status: MemberStatus.ACTIVE },
      select: { role: true },
    });
    if (!member || member.role === Role.PATIENT) {
      throw new NotFoundException('provider not found in this clinic');
    }
  }

  private async tenantHours(tx: PrismaClient, tenantId: string) {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true, settings: true },
    });
    const settings = (tenant?.settings ?? {}) as {
      operatingHours?: Array<{
        weekday: number;
        open: string;
        close: string;
        closed?: boolean;
      }>;
    };
    let timezone = tenant?.timezone || DEFAULT_TZ;
    try {
      assertTimezone(timezone);
    } catch {
      this.logger.warn(
        `tenant ${tenantId} has an invalid timezone "${timezone}" — using ${DEFAULT_TZ}`,
      );
      timezone = DEFAULT_TZ;
    }
    return {
      timezone,
      ranges: operatingHoursToRanges(settings.operatingHours),
    };
  }

  private async effectiveRanges(
    tx: PrismaClient,
    providerId: string,
    tenantId: string,
  ): Promise<{ timezone: string; ranges: WeeklyRange[] }> {
    const [tenant, rules] = await Promise.all([
      this.tenantHours(tx, tenantId),
      tx.providerAvailability.findMany({
        where: { tenantId, providerId },
        select: {
          weekday: true,
          startTime: true,
          endTime: true,
          slotMinutes: true,
        },
      }),
    ]);
    return {
      timezone: tenant.timezone,
      ranges: rules.length > 0 ? rules : tenant.ranges,
    };
  }

  private async timeOffBetween(
    tx: PrismaClient,
    providerId: string,
    tenantId: string,
    from: Date,
    to: Date,
  ) {
    return tx.providerTimeOff.findMany({
      where: {
        tenantId,
        providerId,
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      select: { id: true, startsAt: true, endsAt: true, reason: true },
    });
  }
}
