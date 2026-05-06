import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Plan, TenantStatus } from '@org/db';
import { PlatformAuth } from './decorators/platform-auth.decorator.js';
import {
  CurrentPlatformAdmin,
  type AuthenticatedPlatformAdmin,
} from './decorators/current-platform-admin.decorator.js';
import { PlatformTenantsService } from './platform-tenants.service.js';
import {
  CreateTenantDto,
  UpdateTenantDto,
} from './dto/update-tenant.dto.js';

@ApiTags('platform-tenants')
@ApiBearerAuth('jwt')
@PlatformAuth()
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(private readonly tenants: PlatformTenantsService) {}

  @Get('catalog')
  catalog() {
    return this.tenants.catalog();
  }

  @Get()
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: TenantStatus, enumName: 'TenantStatus' })
  @ApiQuery({ name: 'plan', required: false, enum: Plan, enumName: 'Plan' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Query('search') search?: string,
    @Query('status') status?: TenantStatus,
    @Query('plan') plan?: Plan,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tenants.list({
      search,
      status,
      plan,
      cursor,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenants.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
  ) {
    return this.tenants.update(id, dto, admin.adminId, admin.email);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateTenantDto,
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
  ) {
    return this.tenants.create(dto, admin.adminId, admin.email);
  }
}
