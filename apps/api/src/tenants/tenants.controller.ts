import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Actions } from '@org/auth';
import { AUTH_THROTTLE } from '../common/throttle.config.js';
import { TenantsService } from './tenants.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  // Sign-up bootstrap: creating the first tenant + owner happens before any
  // user has a session. Validation is at the DTO layer (slug/email shape);
  // the auth throttle bucket bounds slug-squatting from one IP. When no
  // ownerPassword is given the response carries a 15-min `bootstrapToken`
  // that /auth/register needs to create the first OWNER — so a tenant shell
  // can't be claimed by whoever guesses the slug first.
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }

  @Get()
  @Requires(Actions.TENANT_MANAGE)
  list() {
    return this.tenants.list();
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.tenants.findBySlug(slug);
  }
}
