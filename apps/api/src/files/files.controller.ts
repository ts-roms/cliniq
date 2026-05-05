import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { FilesService } from './files.service.js';
import {
  ConfirmUploadDto,
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
  @Audit({ action: 'file.presign', entity: 'FileObject', entityIdFrom: 'result:id' })
  presign(
    @Body() dto: PresignRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PresignResponseDto> {
    return this.files.presign(dto, user);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'file.confirm', entity: 'FileObject', entityIdFrom: 'body:id' })
  confirm(@Body() dto: ConfirmUploadDto, @CurrentUser() user: AuthenticatedUser) {
    return this.files.confirm(dto.fileId, user);
  }
}
