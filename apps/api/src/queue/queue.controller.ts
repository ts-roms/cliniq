import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { QueueService } from './queue.service.js';
import {
  CreateQueueDto,
  IssueTicketDto,
  TicketActionDto,
  UpdateQueueDto,
} from './dto/queue.dto.js';

/**
 * Patient queue management. Mounted at /api/queue.
 * Gated by QUEUEING (Pro+); drive-thru / kiosk are separate flags surfaced
 * in the UI but not separately enforced here — staff users with QUEUEING
 * can manage all kinds of queues.
 */
@ApiTags('queue')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.QUEUEING)
@Controller('queue')
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Get('queues')
  @Requires(Actions.TENANT_MANAGE)
  listQueues(@CurrentUser() user: AuthenticatedUser) {
    return this.queue.listQueues(user);
  }

  @Post('queues')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'queue.create', entity: 'Queue', entityIdFrom: 'result:id' })
  createQueue(@Body() dto: CreateQueueDto, @CurrentUser() user: AuthenticatedUser) {
    return this.queue.createQueue(dto, user);
  }

  @Patch('queues/:id')
  @Requires(Actions.TENANT_MANAGE)
  updateQueue(
    @Param('id') id: string,
    @Body() dto: UpdateQueueDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.queue.updateQueue(id, dto, user);
  }

  /** Public display feed for the TV screen — same auth gate as everything
   *  else; mount on a kiosk/TV device with a long-lived staff token. */
  @Get('display')
  @Requires(Actions.TENANT_MANAGE)
  display(@CurrentUser() user: AuthenticatedUser) {
    return this.queue.displayFeed(user);
  }

  @Post('tickets')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'queue.ticket.issue',
    entity: 'QueueTicket',
    entityIdFrom: 'result:id',
  })
  issue(@Body() dto: IssueTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.queue.issueTicket(dto, user);
  }

  @Post('queues/:id/call-next')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'queue.ticket.call_next',
    entity: 'Queue',
    entityIdFrom: 'param:id',
  })
  callNext(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.queue.callNext(id, user);
  }

  @Post('tickets/:id/close')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'queue.ticket.close',
    entity: 'QueueTicket',
    entityIdFrom: 'param:id',
  })
  close(
    @Param('id') id: string,
    @Body() dto: TicketActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.queue.closeTicket(id, dto.status, user);
  }
}
