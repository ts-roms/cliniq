import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { RetentionService } from './retention.service.js';

@ApiTags('retention')
@ApiBearerAuth('jwt')
@Controller('retention')
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Post('run-now')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'retention.purge', entity: 'System' })
  runNow() {
    return this.retention.run();
  }
}
