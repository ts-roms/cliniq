import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { QcOutcome } from '@org/db';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { QcService } from './qc.service.js';
import {
  CorrectiveActionDto,
  RecordQcRunDto,
  SetQcTargetDto,
  UpsertQcMaterialDto,
} from './dto/qc.dto.js';

/**
 * Internal quality control.
 *
 * Materials and targets are `CLINIC_ADMIN` — establishing a target mean is a
 * decision about how every subsequent run will be judged. Recording a run is
 * `LAB_RESULT_ENTER`, because it is bench work by whoever is running the
 * analyser.
 *
 * Every write is audited. "Show me your QC for that day" is the first thing
 * an inspection asks about a result.
 */
@ApiTags('lis')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LABS)
@Controller('lis/qc')
export class QcController {
  constructor(private readonly qc: QcService) {}

  @Get('materials')
  @Requires(Actions.CONSULT_READ)
  listMaterials(@CurrentUser() user: AuthenticatedUser) {
    return this.qc.listMaterials(user);
  }

  @Put('materials')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.qcMaterialUpsert',
    entity: 'QcMaterial',
    entityIdFrom: 'result:id',
  })
  upsertMaterial(
    @Body() dto: UpsertQcMaterialDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.qc.upsertMaterial(dto, user);
  }

  /** Establish the mean and SD. Supersedes the previous target. */
  @Put('targets')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.qcTargetSet',
    entity: 'QcTarget',
    entityIdFrom: 'result:id',
  })
  setTarget(
    @Body() dto: SetQcTargetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.qc.setTarget(dto, user);
  }

  /** Record a control result and evaluate it against the multirules. */
  @Post('runs')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.LAB_RESULT_ENTER)
  @Audit({
    action: 'lis.qcRunRecord',
    entity: 'QcRun',
    entityIdFrom: 'result:id',
  })
  recordRun(
    @Body() dto: RecordQcRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.qc.recordRun(dto, user);
  }

  /** The Levey-Jennings series, oldest first. */
  @Get('runs')
  @Requires(Actions.CONSULT_READ)
  @ApiQuery({ name: 'testId', required: false })
  @ApiQuery({ name: 'materialId', required: false })
  @ApiQuery({
    name: 'outcome',
    required: false,
    enum: QcOutcome,
    enumName: 'QcOutcome',
  })
  listRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Query('testId') testId?: string,
    @Query('materialId') materialId?: string,
    @Query('outcome') outcome?: QcOutcome,
  ) {
    return this.qc.listRuns(user, { testId, materialId, outcome });
  }

  /** What was done about a rejected run. */
  @Post('runs/:id/corrective-action')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.LAB_RESULT_ENTER)
  @Audit({
    action: 'lis.qcCorrectiveAction',
    entity: 'QcRun',
    entityIdFrom: 'param:id',
  })
  correctiveAction(
    @Param('id') id: string,
    @Body() dto: CorrectiveActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.qc.recordCorrectiveAction(id, dto, user);
  }
}
