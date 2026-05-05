import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@org/db';
import type { Observable } from 'rxjs';
import { from, switchMap } from 'rxjs';
import type { Request } from 'express';
import { ConsentsService } from './consents.service.js';
import {
  REQUIRES_CONSENT_KEY,
  type RequiresConsentMeta,
} from './decorators/requires-consent.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Injectable()
export class ConsentsInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly consents: ConsentsService,
    private readonly prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<RequiresConsentMeta | undefined>(
      REQUIRES_CONSENT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<
      Request & {
        user?: AuthenticatedUser;
        params?: Record<string, string>;
        body?: Record<string, unknown>;
      }
    >();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    return from(this.resolvePatientId(meta, req, user)).pipe(
      switchMap(async (patientId) => {
        if (!patientId) {
          throw new ForbiddenException(
            `Could not resolve patientId for consent check (${meta.type})`,
          );
        }
        const ok = await this.consents.hasGranted(patientId, meta.type, user);
        if (!ok) {
          throw new ForbiddenException(
            `Patient ${patientId} has not granted ${meta.type} consent`,
          );
        }
      }),
      switchMap(() => next.handle()),
    );
  }

  private async resolvePatientId(
    meta: RequiresConsentMeta,
    req: { params?: Record<string, string>; body?: Record<string, unknown> },
    user: AuthenticatedUser,
  ): Promise<string | null> {
    switch (meta.patientIdFrom) {
      case 'param:patientId':
        return req.params?.patientId ?? null;
      case 'param:id':
        return req.params?.id ?? null;
      case 'body:patientId':
        return (req.body?.patientId as string) ?? null;
      case 'param:id-consultation':
        return this.patientIdFromConsultation(req.params?.id, user);
      case 'body:fileId-derived':
        return this.patientIdFromFile(req.body?.fileId as string | undefined, user);
      default:
        // Auto-resolve in this order — safe defaults
        if (req.params?.patientId) return req.params.patientId;
        if (req.body?.patientId) return req.body.patientId as string;
        if (req.params?.id) {
          // Best-guess: try consultation lookup. Patient routes use param:id
          // directly so callers should specify patientIdFrom there.
          return this.patientIdFromConsultation(req.params.id, user);
        }
        return null;
    }
  }

  private async patientIdFromConsultation(
    consultId: string | undefined,
    user: AuthenticatedUser,
  ): Promise<string | null> {
    if (!consultId) return null;
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const c = await tx.consultation.findFirst({
        where: { id: consultId, deletedAt: null },
        select: { patientId: true },
      });
      return c?.patientId ?? null;
    });
  }

  private async patientIdFromFile(
    fileId: string | undefined,
    user: AuthenticatedUser,
  ): Promise<string | null> {
    if (!fileId) return null;
    // Files don't carry patientId yet (out of MVP scope). Return null so the
    // interceptor blocks until the schema lands a Patient↔File join column.
    void fileId;
    void user;
    return null;
  }
}
