import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@org/db';
import {
  JWT_AUDIENCES,
  signPlatformJwt,
  verifyPlatformJwt,
  verifyPassword,
  verifyTotp,
} from '@org/auth';
import type {
  PlatformLoginDto,
  PlatformRefreshDto,
} from './dto/platform-login.dto.js';

@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger(PlatformAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: PlatformLoginDto) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: dto.email },
    });
    if (!admin || admin.deletedAt) {
      throw new UnauthorizedException('invalid credentials');
    }
    if (!(await verifyPassword(dto.password, admin.passwordHash))) {
      throw new UnauthorizedException('invalid credentials');
    }

    if (admin.mfaEnabled) {
      if (!dto.mfaCode) {
        throw new UnauthorizedException({
          message: 'mfa required',
          mfaRequired: true,
        });
      }
      // PlatformAdmin stores MFA state directly (MfaService is User-only).
      // Backup-code consumption and lockouts can be added if/when we expose
      // an MFA enrollment flow for platform admins; for now we only verify
      // the TOTP secret on file.
      const ok = !!admin.mfaSecret && verifyTotp(dto.mfaCode, admin.mfaSecret);
      if (!ok) {
        throw new UnauthorizedException({
          message: 'invalid mfa code',
          mfaRequired: true,
        });
      }
    }

    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() },
    });

    return this.issueTokens(admin.id, admin.email);
  }

  async refresh(dto: PlatformRefreshDto) {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    let payload;
    try {
      payload = await verifyPlatformJwt(dto.refreshToken, {
        secret,
        audience: JWT_AUDIENCES.PLATFORM_REFRESH,
      });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, deletedAt: true },
    });
    if (!admin || admin.deletedAt) {
      throw new UnauthorizedException('invalid refresh token');
    }

    return this.issueTokens(admin.id, admin.email);
  }

  private async issueTokens(adminId: string, email: string) {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const accessTtl = this.config.get<string>('PLATFORM_JWT_EXPIRES_IN') ?? '15m';
    const refreshTtl = this.config.get<string>('PLATFORM_REFRESH_TOKEN_EXPIRES_IN') ?? '7d';

    const access = await signPlatformJwt(
      { sub: adminId, email },
      { secret, expiresIn: accessTtl, audience: JWT_AUDIENCES.PLATFORM },
    );
    const refresh = await signPlatformJwt(
      { sub: adminId, email },
      { secret, expiresIn: refreshTtl, audience: JWT_AUDIENCES.PLATFORM_REFRESH },
    );

    this.logger.log(`Issued platform tokens for admin ${adminId}`);
    return {
      accessToken: access,
      refreshToken: refresh,
      tokenType: 'Bearer',
      expiresIn: accessTtl,
      admin: { id: adminId, email },
    };
  }
}
