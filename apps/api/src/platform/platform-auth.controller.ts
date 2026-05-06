import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { PlatformAuth } from './decorators/platform-auth.decorator.js';
import {
  CurrentPlatformAdmin,
  type AuthenticatedPlatformAdmin,
} from './decorators/current-platform-admin.decorator.js';
import { PlatformAuthService } from './platform-auth.service.js';
import {
  PlatformLoginDto,
  PlatformRefreshDto,
} from './dto/platform-login.dto.js';

@ApiTags('platform-auth')
@PlatformAuth()
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly auth: PlatformAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: PlatformLoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: PlatformRefreshDto) {
    return this.auth.refresh(dto);
  }

  @ApiBearerAuth('jwt')
  @Get('me')
  me(@CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin) {
    return admin;
  }
}
