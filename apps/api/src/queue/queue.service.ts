import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  QueueKind,
  QueueTicketStatus,
} from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type {
  CreateQueueDto,
  IssueTicketDto,
  UpdateQueueDto,
} from './dto/queue.dto.js';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Queues ────────────────────────────────────────────────

  async listQueues(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.queue.findMany({
        where: { tenantId: user.tenantId, deletedAt: null },
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  async createQueue(dto: CreateQueueDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      // The unique constraint is (tenantId, locationId, kind). Surface a
      // friendly conflict error rather than the raw P2002.
      const existing = await tx.queue.findFirst({
        where: {
          tenantId: user.tenantId,
          locationId: dto.locationId ?? null,
          kind: dto.kind ?? QueueKind.WALK_IN,
          deletedAt: null,
        },
      });
      if (existing) {
        throw new BadRequestException(
          `a queue already exists for this location + kind (id=${existing.id})`,
        );
      }
      return tx.queue.create({
        data: {
          tenantId: user.tenantId,
          locationId: dto.locationId ?? null,
          kind: dto.kind ?? QueueKind.WALK_IN,
          name: dto.name ?? null,
          numberPrefix: dto.numberPrefix ?? defaultPrefixFor(dto.kind ?? QueueKind.WALK_IN),
        },
      });
    });
  }

  async updateQueue(id: string, dto: UpdateQueueDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.queue.findFirst({
        where: { id, tenantId: user.tenantId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('queue not found');
      return tx.queue.update({
        where: { id },
        data: {
          name: dto.name ?? existing.name,
          numberPrefix: dto.numberPrefix ?? existing.numberPrefix,
          isActive: dto.isActive ?? existing.isActive,
        },
      });
    });
  }

  // ── Tickets ───────────────────────────────────────────────

  /**
   * Issue a new ticket for the given queue. Allocates the next number
   * scoped to (queue, serviceDate). Race-prone under heavy concurrency —
   * acceptable for MVP. Production-hardening: a per-queue counter row
   * with `UPDATE ... RETURNING` would serialise issuance.
   */
  async issueTicket(dto: IssueTicketDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const queue = await tx.queue.findFirst({
        where: { id: dto.queueId, tenantId: user.tenantId, deletedAt: null, isActive: true },
      });
      if (!queue) {
        throw new NotFoundException('queue not found or inactive');
      }
      const serviceDate = todayUtc();
      const max = await tx.queueTicket.aggregate({
        where: { queueId: queue.id, serviceDate },
        _max: { number: true },
      });
      const number = (max._max.number ?? 0) + 1;
      const numberLabel = `${queue.numberPrefix}-${String(number).padStart(3, '0')}`;
      const priority =
        dto.priority ?? (queue.kind === QueueKind.PRIORITY ? 100 : 0);

      return tx.queueTicket.create({
        data: {
          queueId: queue.id,
          tenantId: user.tenantId,
          patientId: dto.patientId ?? null,
          serviceDate,
          number,
          numberLabel,
          status: QueueTicketStatus.WAITING,
          label: dto.label ?? null,
          phone: dto.phone ?? null,
          priority,
          issuedByUserId: user.userId,
        },
      });
    });
  }

  /** Public-display-screen feed: today's tickets per queue, ordered for the TV. */
  async displayFeed(user: AuthenticatedUser) {
    const serviceDate = todayUtc();
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const queues = await tx.queue.findMany({
        where: { tenantId: user.tenantId, deletedAt: null, isActive: true },
        orderBy: [{ kind: 'asc' }],
      });
      const tickets = await tx.queueTicket.findMany({
        where: { tenantId: user.tenantId, serviceDate },
        orderBy: [{ priority: 'desc' }, { number: 'asc' }],
      });
      return queues.map((q) => ({
        queue: q,
        tickets: tickets.filter((t) => t.queueId === q.id),
      }));
    });
  }

  /** Pop the next WAITING ticket: highest priority, lowest number first. */
  async callNext(queueId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const next = await tx.queueTicket.findFirst({
        where: {
          queueId,
          tenantId: user.tenantId,
          status: QueueTicketStatus.WAITING,
        },
        orderBy: [{ priority: 'desc' }, { number: 'asc' }],
      });
      if (!next) {
        throw new NotFoundException('no waiting tickets in this queue');
      }
      return tx.queueTicket.update({
        where: { id: next.id },
        data: { status: QueueTicketStatus.CALLED, calledAt: new Date() },
      });
    });
  }

  /** Mark a CALLED ticket as served (or NO_SHOW / CANCELLED). */
  async closeTicket(id: string, target: QueueTicketStatus, user: AuthenticatedUser) {
    if (
      target !== QueueTicketStatus.SERVED &&
      target !== QueueTicketStatus.NO_SHOW &&
      target !== QueueTicketStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'closeTicket only accepts SERVED, NO_SHOW, or CANCELLED',
      );
    }
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const t = await tx.queueTicket.findFirst({
        where: { id, tenantId: user.tenantId },
      });
      if (!t) throw new NotFoundException('ticket not found');
      if (t.status === target) return t;
      const now = new Date();
      return tx.queueTicket.update({
        where: { id },
        data: {
          status: target,
          servedAt: target === QueueTicketStatus.SERVED ? now : t.servedAt,
          closedAt: now,
        },
      });
    });
  }
}

/** UTC midnight today — keeps numbering boundaries deterministic. */
function todayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function defaultPrefixFor(kind: QueueKind): string {
  switch (kind) {
    case QueueKind.WALK_IN: return 'A';
    case QueueKind.APPOINTMENT: return 'B';
    case QueueKind.DRIVE_THRU: return 'D';
    case QueueKind.PRIORITY: return 'P';
    default: return 'A';
  }
}
