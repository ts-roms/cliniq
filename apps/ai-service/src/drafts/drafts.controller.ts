import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DraftsService } from './drafts.service.js';
import { SoapDraftRequestDto, SoapDraftResponseDto } from './dto/soap-draft.dto.js';

@ApiTags('drafts')
@ApiBearerAuth('jwt')
@Controller('drafts')
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Post('soap')
  @HttpCode(HttpStatus.OK)
  async soap(@Body() dto: SoapDraftRequestDto): Promise<SoapDraftResponseDto> {
    const { rawText: _raw, ...rest } = await this.drafts.draftSoap({
      patientContext: dto.patientContext,
      transcript: dto.transcript,
    });
    return rest;
  }
}
