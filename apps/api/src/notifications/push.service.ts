import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@org/db';

interface ExpoMessage {
  to: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Best-effort Expo push dispatcher. Reads tokens from `push_tokens` and posts
 * to Expo's batch send endpoint (no SDK — single fetch keeps the dep tree
 * minimal). Tokens that come back with `DeviceNotRegistered` are deleted so
 * the table doesn't accumulate dead handles. Never throws — push delivery
 * failure must not break the calling business action.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist a token from the mobile client. Idempotent on (userId, deviceId)
   * AND on `token` globally (Expo can re-issue the same token across reinstalls).
   */
  async register(input: {
    tenantId: string;
    userId: string;
    deviceId: string;
    token: string;
    platform: string;
  }): Promise<{ id: string }> {
    // Stale-row cleanup, deliberately cross-tenant — hence the platform
    // context rather than withTenant. Two unique constraints can collide
    // with a row this tenant cannot see:
    //
    //   @unique(token)             Expo re-issues the same token across
    //                              reinstalls, so the device's previous
    //                              owner may sit in another tenant.
    //   @unique(userId, deviceId)  a clinician working at two clinics
    //                              re-registers the same phone under the
    //                              other tenant.
    //
    // Either one would make the tenant-scoped upsert below fail on insert,
    // because RLS hides the conflicting row from the find that would have
    // turned it into an update. Clear both first. Rows already in THIS
    // tenant are left alone so the upsert can update them in place.
    await this.prisma.withPlatformContext((tx) =>
      tx.pushToken.deleteMany({
        where: {
          tenantId: { not: input.tenantId },
          OR: [
            { token: input.token },
            { userId: input.userId, deviceId: input.deviceId },
          ],
        },
      }),
    );

    return this.prisma.withTenant(input.tenantId, input.userId, (tx) =>
      tx.pushToken.upsert({
        where: {
          userId_deviceId: { userId: input.userId, deviceId: input.deviceId },
        },
        create: {
          tenantId: input.tenantId,
          userId: input.userId,
          deviceId: input.deviceId,
          token: input.token,
          platform: input.platform,
        },
        update: {
          token: input.token,
          platform: input.platform,
          lastUsed: new Date(),
        },
        select: { id: true },
      }),
    );
  }

  async unregister(
    tenantId: string,
    userId: string,
    deviceId: string,
  ): Promise<void> {
    await this.prisma.withTenant(tenantId, userId, (tx) =>
      tx.pushToken.deleteMany({ where: { userId, deviceId } }),
    );
  }

  /**
   * `tenantId` is not decoration: a user who belongs to two tenants has a
   * device row per tenant, and querying by userId alone pushed one tenant's
   * payload — patient name in the title, on a lock screen — to the device
   * registered under the other.
   */
  async sendToUser(
    tenantId: string,
    userId: string,
    payload: { title: string; body?: string; data?: Record<string, unknown> },
  ): Promise<void> {
    const tokens = await this.prisma.withTenant(tenantId, null, (tx) =>
      tx.pushToken.findMany({ where: { userId }, select: { token: true } }),
    );
    if (tokens.length === 0) return;
    await this.dispatch(
      tokens.map((t) => ({
        to: t.token,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sound: 'default',
        priority: 'high',
      })),
    );
  }

  async sendToUsers(
    tenantId: string,
    userIds: string[],
    payload: { title: string; body?: string; data?: Record<string, unknown> },
  ): Promise<void> {
    if (userIds.length === 0) return;
    const tokens = await this.prisma.withTenant(tenantId, null, (tx) =>
      tx.pushToken.findMany({
        where: { userId: { in: userIds } },
        select: { token: true },
      }),
    );
    if (tokens.length === 0) return;
    await this.dispatch(
      tokens.map((t) => ({
        to: t.token,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sound: 'default',
        priority: 'high',
      })),
    );
  }

  private async dispatch(messages: ExpoMessage[]): Promise<void> {
    // Expo accepts up to 100 messages per request. Chunk just in case.
    const CHUNK = 100;
    for (let i = 0; i < messages.length; i += CHUNK) {
      const slice = messages.slice(i, i + CHUNK);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'accept-encoding': 'gzip, deflate',
            'content-type': 'application/json',
          },
          body: JSON.stringify(slice),
        });
        if (!res.ok) {
          const text = await res.text();
          this.logger.warn(
            `expo push http ${res.status}: ${text.slice(0, 200)}`,
          );
          continue;
        }
        const json = (await res.json()) as { data?: ExpoTicket[] };
        const tickets = json.data ?? [];
        // Reap dead tokens so we don't keep retrying them.
        const dead = tickets
          .map((t, idx) => ({
            token: slice[idx]?.to,
            err: t.status === 'error' ? (t.details?.error ?? '') : '',
          }))
          .filter(
            (x) =>
              x.token &&
              (x.err === 'DeviceNotRegistered' ||
                x.err === 'InvalidCredentials' ||
                x.err === 'MismatchSenderId'),
          );
        if (dead.length) {
          // Cross-tenant on purpose: Expo has told us these handles are dead
          // everywhere, and a batch can span tenants. Platform context, so
          // the intent is declared rather than inherited from a missing
          // policy — which is exactly how this table lost its isolation.
          await this.prisma
            .withPlatformContext((tx) =>
              tx.pushToken.deleteMany({
                where: { token: { in: dead.map((d) => d.token!) } },
              }),
            )
            .catch(() => undefined);
          this.logger.log(`reaped ${dead.length} dead push tokens`);
        }
      } catch (err) {
        this.logger.error(`push dispatch failed: ${(err as Error).message}`);
      }
    }
  }
}
