import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export interface AuthenticatedPlatformAdmin {
  adminId: string;
  email: string;
}

export const CurrentPlatformAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedPlatformAdmin => {
    const req = ctx.switchToHttp().getRequest<{ platformAdmin?: AuthenticatedPlatformAdmin }>();
    if (!req.platformAdmin) {
      throw new Error('CurrentPlatformAdmin used on a route without @PlatformAuth');
    }
    return req.platformAdmin;
  },
);
