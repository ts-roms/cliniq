import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { SettingsService } from './settings.service.js';
import { UpdateSettingsDto } from './dto/settings.dto.js';

@ApiTags('settings')
@ApiBearerAuth('jwt')
@Controller('tenants/me/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Read is open to any authenticated tenant member so the web header can
  // render branding (logo/color/tagline) for non-admin roles. Sensitive
  // settings should not live in this payload.
  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.get(user);
  }

  @Patch()
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'tenant.settingsUpdate', entity: 'Tenant' })
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.settings.update(dto, user);
  }
}
