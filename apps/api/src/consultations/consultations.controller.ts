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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { RequiresConsent } from '../consents/decorators/requires-consent.decorator.js';
import { ConsentTypeDto } from '../consents/dto/set-consent.dto.js';
import { ConsultationsService } from './consultations.service.js';
import { StartConsultationDto } from './dto/start-consultation.dto.js';
import { UpdateConsultationDto } from './dto/update-consultation.dto.js';
import { DecideAiSuggestionDto } from './dto/submit-ai-suggestion.dto.js';
import { GenerateSoapDto } from './dto/generate-soap.dto.js';
import { GenerateDermDto } from './dto/generate-derm.dto.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';

@ApiTags('consultations')
@ApiBearerAuth('jwt')
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consults: ConsultationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.CONSULT_WRITE)
  @Audit({ action: 'consult.start', entity: 'Consultation', entityIdFrom: 'result:id' })
  start(@Body() dto: StartConsultationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.consults.start(dto, user);
  }

  @Get()
  @Requires(Actions.CONSULT_READ)
  list(@Query('patientId') patientId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.consults.listForPatient(patientId, user);
  }

  @Get(':id')
  @Requires(Actions.CONSULT_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.consults.findById(id, user);
  }

  @Patch(':id')
  @Requires(Actions.CONSULT_WRITE)
  @Audit({ action: 'consult.update', entity: 'Consultation', entityIdFrom: 'param:id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateConsultationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.consults.update(id, dto, user);
  }

  @Post(':id/complete')
  @Requires(Actions.CONSULT_WRITE)
  @Audit({ action: 'consult.complete', entity: 'Consultation', entityIdFrom: 'param:id' })
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.consults.complete(id, user);
  }

  // ── AI draft generation ──────────────────────────────

  @Post(':id/drafts/dermatology')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.AI_USE)
  @RequiresConsent(ConsentTypeDto.AI_PROCESSING, 'param:id-consultation')
  @Audit({ action: 'ai.draft.derm', entity: 'Consultation', entityIdFrom: 'param:id' })
  generateDerm(
    @Param('id') id: string,
    @Body() dto: GenerateDermDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.consults.generateDermDraft(id, dto.fileIds, dto.presentingComplaint, user);
  }

  @Post(':id/drafts/soap')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.AI_USE)
  @RequiresConsent(ConsentTypeDto.AI_PROCESSING, 'param:id-consultation')
  @Audit({ action: 'ai.draft.soap', entity: 'Consultation', entityIdFrom: 'param:id' })
  generateSoap(
    @Param('id') id: string,
    @Body() dto: GenerateSoapDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.consults.generateSoapDraft(id, dto.transcript, user);
  }

  // ── AI suggestions ───────────────────────────────────

  @Get(':id/suggestions')
  @Requires(Actions.AI_USE)
  listSuggestions(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.consults.listSuggestions(id, user);
  }

  @Patch(':id/suggestions/:sid')
  @Requires(Actions.AI_USE)
  @Audit({ action: 'ai.suggestion.decide', entity: 'AiSuggestion', entityIdFrom: 'param:sid' })
  decideSuggestion(
    @Param('id') id: string,
    @Param('sid') sid: string,
    @Body() dto: DecideAiSuggestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.consults.decideSuggestion(id, sid, dto, user);
  }
}
