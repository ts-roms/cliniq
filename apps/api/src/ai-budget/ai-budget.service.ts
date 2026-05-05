import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationKind,
  NotificationSeverity,
  PrismaService,
  Plan,
  Role,
} from '@org/db';
import { MailerService } from '../mailer/mailer.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export interface BudgetUsage {
  monthYear: string;
  budgetCentavos: number;
  spentCentavos: number;
  remainingCentavos: number;
  hardStopped: boolean;
  alertsSent: number;
}

const ALERT_THRESHOLDS = [0.5, 0.8, 1.0] as const;

/**
 * Per-plan monthly AI budget in centavos. Mirrors the pricing tiers in
 * docs/06-pricing-business-model.md (Gold ₱100, Premium ₱500, Diamond
 * ₱1,500, Enterprise ₱5,000+). Override per-tenant by writing an `AiBudget`
 * row directly with a custom `budgetCentavos` (e.g. for over-purchased packs).
 */
export const PLAN_BUDGETS_CENTAVOS: Record<Plan, number> = {
  GOLD: 10_000,
  PREMIUM: 50_000,
  DIAMOND: 150_000,
  ENTERPRISE: 500_000,
};

@Injectable()
export class AiBudgetService {
  private readonly logger = new Logger(AiBudgetService.name);
  private readonly fallbackBudgetCentavos: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly notif: NotificationsService,
  ) {
    this.fallbackBudgetCentavos = Number(
      this.config.get<string>('AI_DEFAULT_MONTHLY_BUDGET_CENTAVOS') ?? 10_000,
    );
  }

  /** Returns the plan-tier budget for a tenant, falling back to env default. */
  async budgetFor(tenantId: string): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    if (!tenant) return this.fallbackBudgetCentavos;
    return PLAN_BUDGETS_CENTAVOS[tenant.plan] ?? this.fallbackBudgetCentavos;
  }

  /**
   * Block the call if the tenant has exceeded its monthly cap or been
   * hard-stopped. Throws 429 with the usage payload — clients can render a
   * friendly "AI budget reached" banner.
   */
  async assertNotExceeded(tenantId: string): Promise<BudgetUsage> {
    const usage = await this.getUsage(tenantId);
    if (usage.hardStopped || usage.spentCentavos >= usage.budgetCentavos) {
      throw new HttpException(
        {
          message: 'AI budget for this month reached. Upgrade plan or wait until next cycle.',
          usage,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return usage;
  }

  /**
   * Add the cost of one inference. Logs at warn level when crossing 50/80%
   * and at error level when crossing 100% (and flips hardStopped).
   */
  async record(tenantId: string, costCentavos: number): Promise<BudgetUsage> {
    if (costCentavos <= 0) return this.getUsage(tenantId);

    const monthYear = currentMonthKey();
    const planBudget = await this.budgetFor(tenantId);
    const updated = await this.prisma.aiBudget.upsert({
      where: { tenantId_monthYear: { tenantId, monthYear } },
      create: {
        tenantId,
        monthYear,
        budgetCentavos: planBudget,
        spentCentavos: costCentavos,
        alertsSent: 0,
      },
      update: { spentCentavos: { increment: costCentavos } },
    });

    const ratio = updated.spentCentavos / Math.max(1, updated.budgetCentavos);
    const newAlertsSent = ALERT_THRESHOLDS.filter((t) => ratio >= t).length;
    if (newAlertsSent > updated.alertsSent || (ratio >= 1 && !updated.hardStopped)) {
      const next = await this.prisma.aiBudget.update({
        where: { id: updated.id },
        data: {
          alertsSent: newAlertsSent,
          hardStopped: ratio >= 1,
        },
      });
      this.logger.warn(
        `tenant=${tenantId} ai-budget ${(ratio * 100).toFixed(1)}% used ` +
          `(${next.spentCentavos}/${next.budgetCentavos}¢, alerts=${next.alertsSent}, stopped=${next.hardStopped})`,
      );
      // Fire-and-forget — never let mail issues block the inference path.
      void this.notifyOwners(tenantId, next).catch((err) =>
        this.logger.warn(`alert email failed: ${(err as Error).message}`),
      );
      // Mirror the email alert as an in-app notification to OWNER/ADMIN.
      const pct = Math.round((next.spentCentavos / Math.max(1, next.budgetCentavos)) * 100);
      void this.notif.notifyRoles(tenantId, ['OWNER', 'ADMIN'], {
        kind: NotificationKind.AI_BUDGET_ALERT,
        severity: next.hardStopped
          ? NotificationSeverity.CRITICAL
          : NotificationSeverity.WARNING,
        title: next.hardStopped
          ? 'AI budget exhausted'
          : `AI budget at ${pct}%`,
        body: `Spent ₱${(next.spentCentavos / 100).toFixed(2)} of ₱${(next.budgetCentavos / 100).toFixed(2)} this month`,
        link: `/dashboard`,
        entityId: next.id,
      });
      return this.toUsage(next);
    }

    return this.toUsage(updated);
  }

  private async notifyOwners(
    tenantId: string,
    state: { spentCentavos: number; budgetCentavos: number; hardStopped: boolean; monthYear: string },
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, slug: true },
    });
    const owners = await this.prisma.tenantUser.findMany({
      where: { tenantId, role: Role.OWNER, status: 'ACTIVE' as never },
      include: { user: { select: { email: true } } },
    });
    const recipients = owners.map((o) => o.user.email).filter(Boolean);
    if (recipients.length === 0) return;

    const ratio = state.spentCentavos / Math.max(1, state.budgetCentavos);
    const pct = (ratio * 100).toFixed(0);
    const subject = state.hardStopped
      ? `[ClinIQ] AI budget exhausted for ${tenant?.name ?? tenantId}`
      : `[ClinIQ] AI budget at ${pct}% for ${tenant?.name ?? tenantId}`;
    const text = state.hardStopped
      ? `Your monthly AI scribe budget has been used up for ${state.monthYear}.\n\n` +
        `New AI generations are paused until next cycle. Upgrade your plan or contact support to lift the cap.\n`
      : `Your AI scribe usage has reached ${pct}% of the monthly cap for ${state.monthYear}.\n\n` +
        `Spent: ₱${(state.spentCentavos / 100).toFixed(2)} of ₱${(state.budgetCentavos / 100).toFixed(2)}.\n`;
    await this.mailer.send({ to: recipients, subject, text });
  }

  async getUsage(tenantId: string): Promise<BudgetUsage> {
    const monthYear = currentMonthKey();
    const row = await this.prisma.aiBudget.findUnique({
      where: { tenantId_monthYear: { tenantId, monthYear } },
    });
    if (!row) {
      const planBudget = await this.budgetFor(tenantId);
      return {
        monthYear,
        budgetCentavos: planBudget,
        spentCentavos: 0,
        remainingCentavos: planBudget,
        hardStopped: false,
        alertsSent: 0,
      };
    }
    return this.toUsage(row);
  }

  private toUsage(row: {
    monthYear: string;
    budgetCentavos: number;
    spentCentavos: number;
    hardStopped: boolean;
    alertsSent: number;
  }): BudgetUsage {
    return {
      monthYear: row.monthYear,
      budgetCentavos: row.budgetCentavos,
      spentCentavos: row.spentCentavos,
      remainingCentavos: Math.max(0, row.budgetCentavos - row.spentCentavos),
      hardStopped: row.hardStopped,
      alertsSent: row.alertsSent,
    };
  }
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Token-cost calculator. Centavos = PHP cents (integer math; no float drift).
 * Sonnet 4.6 input ~$3/M, output ~$15/M, cache-read ~$0.30/M. PHP/USD ~56 →
 * 1¢ = ~$0.0001786, so for simplicity we collapse to flat per-1k rates.
 *
 * Updated when pricing or FX moves materially. For high-volume usage this
 * should pull from a `BedrockPricing` config table instead.
 */
export function estimateCostCentavos(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}): number {
  const isHaiku = /haiku/i.test(input.model);
  const inputRate = isHaiku ? 0.005 : 0.017; // ¢ per 1k tokens
  const outputRate = isHaiku ? 0.024 : 0.084;
  const cacheRate = isHaiku ? 0.0005 : 0.0017;

  const cents =
    (input.inputTokens / 1000) * inputRate +
    (input.outputTokens / 1000) * outputRate +
    (input.cacheReadTokens / 1000) * cacheRate;
  return Math.max(1, Math.ceil(cents * 100)); // store in centavos (integer)
}
