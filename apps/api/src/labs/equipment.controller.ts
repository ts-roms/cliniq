import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { EquipmentService } from './equipment.service.js';
import {
  RecordCalibrationDto,
  UpsertEquipmentDto,
  UpsertReagentLotDto,
} from './dto/equipment.dto.js';

/**
 * Equipment, calibration and reagent lots.
 *
 * Cataloguing instruments and lots is `CLINIC_ADMIN` — back-office record
 * keeping. Recording a calibration is `LAB_RESULT_ENTER`, because it is bench
 * work by whoever performed it.
 */
@ApiTags('lis')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LABS)
@Controller('lis')
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  /** Instruments, each with its calibration status computed. */
  @Get('equipment')
  @Requires(Actions.CONSULT_READ)
  listEquipment(@CurrentUser() user: AuthenticatedUser) {
    return this.equipment.listEquipment(user);
  }

  @Put('equipment')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.equipmentUpsert',
    entity: 'Equipment',
    entityIdFrom: 'result:id',
  })
  upsertEquipment(
    @Body() dto: UpsertEquipmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.equipment.upsertEquipment(dto, user);
  }

  @Post('equipment/calibrations')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.LAB_RESULT_ENTER)
  @Audit({
    action: 'lis.calibrationRecord',
    entity: 'Calibration',
    entityIdFrom: 'result:id',
  })
  recordCalibration(
    @Body() dto: RecordCalibrationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.equipment.recordCalibration(dto, user);
  }

  @Get('equipment/:id/calibrations')
  @Requires(Actions.CONSULT_READ)
  listCalibrations(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.equipment.listCalibrations(id, user);
  }

  /** Reagent lots, each with both expiry clocks resolved. */
  @Get('reagent-lots')
  @Requires(Actions.CONSULT_READ)
  listReagentLots(@CurrentUser() user: AuthenticatedUser) {
    return this.equipment.listReagentLots(user);
  }

  @Put('reagent-lots')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.reagentLotUpsert',
    entity: 'ReagentLot',
    entityIdFrom: 'result:id',
  })
  upsertReagentLot(
    @Body() dto: UpsertReagentLotDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.equipment.upsertReagentLot(dto, user);
  }

  /**
   * Every result a given lot produced — the recall query.
   *
   * This is why the traceability columns exist. `CONSULT_READ` rather than
   * admin: when a lot is recalled, the people who need this are the ones
   * working out who to re-test and who to tell.
   */
  @Get('reagent-lots/:id/results')
  @Requires(Actions.CONSULT_READ)
  @Audit({
    action: 'lis.reagentLotTrace',
    entity: 'ReagentLot',
    entityIdFrom: 'param:id',
  })
  resultsFromLot(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.equipment.resultsFromLot(id, user);
  }
}
