import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Actions } from '@org/auth';
import { TenantsService } from './tenants.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  // Sign-up bootstrap: creating the first tenant + owner happens before any
  // user has a session. Validation is at the DTO layer (slug/email shape).
  // Abuse mitigation lives at the edge (rate-limit + CAPTCHA on the marketing
  // signup page), not here.
  @Public()
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
