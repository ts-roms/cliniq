import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { FilesService } from './files.service.js';
import {
  ConfirmUploadDto,
  DownloadResponseDto,
  PresignRequestDto,
  PresignResponseDto,
} from './dto/presign.dto.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { Audit } from '../audit/audit.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';

@ApiTags('files')
@ApiBearerAuth('jwt')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({
    action: 'file.presign',
    entity: 'FileObject',
    entityIdFrom: 'result:id',
  })
  presign(
    @Body() dto: PresignRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PresignResponseDto> {
    return this.files.presign(dto, user);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({
    action: 'file.confirm',
    entity: 'FileObject',
    entityIdFrom: 'body:id',
  })
  confirm(
    @Body() dto: ConfirmUploadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.files.confirm(dto.fileId, user);
  }
  /**
   * Issue a short-lived presigned GET for one file.
   *
   * STAFF ONLY. PATIENT_READ is held by every staff role and by no portal
   * account (#30 moved PATIENT to PORTAL_READ), and RLS already scopes the
   * lookup to the caller's tenant — which is the correct rule for staff,
   * since they may see any patient in their clinic.
   *
   * The portal's equivalent is GET /api/me/files/:id/download, which adds the
   * ownership check. Two routes rather than one because the two callers need
   * genuinely different rules, and collapsing them would mean gating on an
   * action both hold — which is exactly the mistake #30 fixed.
   *
   * Audited on every call. A download of PHI is exactly the event an
   * inspection asks to see, and it was previously unrecorded because the
   * route did not exist.
   */
  @Get(':id/download')
  @Requires(Actions.PATIENT_READ)
  @Audit({
    action: 'file.download',
    entity: 'FileObject',
    entityIdFrom: 'param:id',
  })
  download(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DownloadResponseDto> {
    return this.files.download(id, user);
  }
}
