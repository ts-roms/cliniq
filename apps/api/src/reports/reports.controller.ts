import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { ReportsService } from './reports.service.js';
import { ReportRangeDto, TopServicesDto } from './dto/reports.dto.js';

@ApiTags('reports')
@ApiBearerAuth('jwt')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  @Requires(Actions.AUDIT_READ)
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.overview(user);
  }

  @Get('revenue')
  @Requires(Actions.AUDIT_READ)
  revenue(@Query() range: ReportRangeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.revenueSeries(user, range.from, range.to);
  }

  @Get('top-services')
  @Requires(Actions.AUDIT_READ)
  topServices(@Query() q: TopServicesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.topServices(user, q.from, q.to, q.limit);
  }

  @Get('no-shows')
  @Requires(Actions.AUDIT_READ)
  noShows(@Query() range: ReportRangeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.noShowRate(user, range.from, range.to);
  }
}
