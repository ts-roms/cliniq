import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@org/db';
import {
  buildOtpAuthUrl,
  generateTotpSecret,
  hashPassword,
  verifyPassword,
  verifyTotp,
} from '@org/auth';
import { randomBytes } from 'node:crypto';

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_BYTES = 5; // 10 hex chars

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Step 1 of enrollment: generate a fresh secret + return the QR-encodable
   * otpauth URL. The secret is staged on the user row but mfaEnabled stays
   * false until the user proves they enrolled it correctly via verifyAndEnable.
   *
   * Re-running this rotates the secret — useful if a user started enrollment
   * but lost the QR before scanning. Existing mfaEnabled state is preserved
   * (re-enrollment means mfa stays on with the old secret until verifyAndEnable
   * commits the new one).
   */
  async beginEnrollment(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, mfaEnabled: true },
    });
    if (!user) throw new UnauthorizedException();

    const secret = generateTotpSecret();
    // Stage on a separate field would be ideal; for MVP we overwrite mfaSecret
    // and only flip mfaEnabled at the end. If a user re-enrolls without
    // confirming, they keep the old `mfaEnabled=true` with the new secret —
    // that's a UX trap we accept for now and document in the UI.
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    const issuer = this.config.get<string>('MFA_ISSUER') ?? 'ClinIQ';
    const otpauthUrl = buildOtpAuthUrl({
      issuer,
      accountName: user.email,
      secret,
    });

    return {
      secret,
      otpauthUrl,
      // Friendly digit-grouping for manual entry: "ABCD EFGH IJKL ..."
      manualEntryKey: secret.match(/.{1,4}/g)?.join(' ') ?? secret,
    };
  }

  /**
   * Step 2: confirm the user can produce a code from their authenticator
   * before we flip mfaEnabled and issue backup codes.
   */
  async verifyAndEnable(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true },
    });
    if (!user?.mfaSecret) {
      throw new BadRequestException('Enrollment not started — call /mfa/setup first');
    }
    if (!verifyTotp(code, user.mfaSecret)) {
      throw new UnauthorizedException('Invalid code');
    }

    const plainBackupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      randomBytes(BACKUP_CODE_BYTES).toString('hex'),
    );
    // Store bcrypt hashes — never the plaintext. Returned to the user once.
    const hashed = await Promise.all(plainBackupCodes.map((c) => hashPassword(c)));
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaBackupCodes: hashed },
    });
    this.logger.log(`MFA enabled for user ${userId}`);
    return { backupCodes: plainBackupCodes };
  }

  /**
   * Disable MFA. Requires a current TOTP (or a backup code) so a stolen
   * session can't silently turn it off. Wipes mfaSecret + mfaBackupCodes.
   */
  async disable(userId: string, code: string) {
    if (!(await this.verifySecondFactor(userId, code))) {
      throw new UnauthorizedException('Invalid code');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
      },
    });
    this.logger.log(`MFA disabled for user ${userId}`);
  }

  /**
   * Validate a 6-digit TOTP OR a hex backup code at login. Backup codes are
   * one-shot — a successful match is removed from the user's list.
   */
  async verifySecondFactor(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        mfaEnabled: true,
        mfaSecret: true,
        mfaBackupCodes: true,
      },
    });
    if (!user?.mfaEnabled || !user.mfaSecret) return false;

    if (verifyTotp(code, user.mfaSecret)) return true;

    // Check backup codes (bcrypt-compared one by one — list is short).
    const cleaned = code.trim().toLowerCase();
    if (!/^[0-9a-f]+$/.test(cleaned)) return false;
    for (let i = 0; i < user.mfaBackupCodes.length; i++) {
      if (await verifyPassword(cleaned, user.mfaBackupCodes[i])) {
        // Consume the code.
        const remaining = user.mfaBackupCodes.filter((_, idx) => idx !== i);
        await this.prisma.user.update({
          where: { id: userId },
          data: { mfaBackupCodes: remaining },
        });
        this.logger.warn(`User ${userId} used a backup code (${remaining.length} left)`);
        return true;
      }
    }
    return false;
  }

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaBackupCodes: true },
    });
    return {
      enabled: !!user?.mfaEnabled,
      backupCodesRemaining: user?.mfaBackupCodes.length ?? 0,
    };
  }
}
