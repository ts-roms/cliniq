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
    // Drop any prior row that holds this exact token under a different
    // (user, device) — Expo guarantees token uniqueness across installs but
    // a logout/re-login on the same device under a different user can hit
    // the @unique(token) constraint.
    await this.prisma.pushToken.deleteMany({
      where: { token: input.token, NOT: { AND: [{ userId: input.userId }, { deviceId: input.deviceId }] } },
    });

    const row = await this.prisma.pushToken.upsert({
      where: { userId_deviceId: { userId: input.userId, deviceId: input.deviceId } },
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
        // tenantId may change if the user belongs to multiple tenants and
        // re-registered under a different one — keep it in sync.
        tenantId: input.tenantId,
      },
      select: { id: true },
    });
    return row;
  }

  async unregister(userId: string, deviceId: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({
      where: { userId, deviceId },
    });
  }

  async sendToUser(
    userId: string,
    payload: { title: string; body?: string; data?: Record<string, unknown> },
  ): Promise<void> {
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });
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
    userIds: string[],
    payload: { title: string; body?: string; data?: Record<string, unknown> },
  ): Promise<void> {
    if (userIds.length === 0) return;
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
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
            err: t.status === 'error' ? t.details?.error ?? '' : '',
          }))
          .filter(
            (x) =>
              x.token &&
              (x.err === 'DeviceNotRegistered' ||
                x.err === 'InvalidCredentials' ||
                x.err === 'MismatchSenderId'),
          );
        if (dead.length) {
          await this.prisma.pushToken
            .deleteMany({ where: { token: { in: dead.map((d) => d.token!) } } })
            .catch(() => undefined);
          this.logger.log(`reaped ${dead.length} dead push tokens`);
        }
      } catch (err) {
        this.logger.error(`push dispatch failed: ${(err as Error).message}`);
      }
    }
  }
}
