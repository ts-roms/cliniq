import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { CalendarsService } from './calendars.service.js';

@ApiTags('calendars')
@ApiBearerAuth('jwt')
@Controller('calendars')
export class CalendarsController {
  constructor(private readonly cal: CalendarsService) {}

  /** Authenticated: issue a feed token + URL stub for the target provider. */
  @Get('providers/:id/feed-token')
  issueToken(@Param('id') providerId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cal.issueFeedToken(providerId, user);
  }

  /** Public: ICS feed consumed by external calendar apps. */
  @Public()
  @Get('providers/:tenantId/:id.ics')
  @ApiQuery({ name: 't', required: true, type: String, description: 'Signed feed token' })
  async ics(
    @Param('tenantId') tenantId: string,
    @Param('id') providerId: string,
    @Query('t') token: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!token) throw new BadRequestException('missing token');
    const ics = await this.cal.renderIcs(tenantId, providerId, token);
    res.set({
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `inline; filename="provider-${providerId}.ics"`,
      'cache-control': 'no-cache',
    });
    res.send(ics);
    return undefined;
  }
}
