import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../auth/decorators/public.decorator.js';
import { LabInvoicesService } from './lab-invoices.service.js';
import { PaymongoService, type PaymongoWebhookEvent } from './paymongo.service.js';

/**
 * Inbound PayMongo webhook. Mounted at /api/webhooks/paymongo (no auth — the
 * HMAC signature is the auth). PayMongo sends events with a header
 * `paymongo-signature: t=<ts>,te=<test_sig>,li=<live_sig>` signed with
 * `PAYMONGO_WEBHOOK_SECRET`.
 *
 * The signed payload is `<timestamp>.<raw_body>` so we MUST verify against
 * the unparsed buffer (main.ts opts in via `rawBody: true`).
 */
@ApiTags('webhooks')
@Controller('webhooks/paymongo')
export class PaymongoWebhookController {
  private readonly logger = new Logger(PaymongoWebhookController.name);

  constructor(
    private readonly paymongo: PaymongoService,
    private readonly invoices: LabInvoicesService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('paymongo-signature') signature?: string,
  ) {
    const raw = req.rawBody?.toString('utf8');
    if (!raw) {
      this.logger.warn('paymongo webhook: missing raw body');
      throw new UnauthorizedException('missing body');
    }
    if (!this.paymongo.verifyWebhook(raw, signature)) {
      this.logger.warn('paymongo webhook: signature mismatch');
      throw new UnauthorizedException('invalid signature');
    }
    let event: PaymongoWebhookEvent;
    try {
      event = JSON.parse(raw) as PaymongoWebhookEvent;
    } catch {
      this.logger.warn('paymongo webhook: malformed JSON');
      throw new UnauthorizedException('malformed payload');
    }
    return this.invoices.handlePaymongoEvent(event);
  }
}
