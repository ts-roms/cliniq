import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { TeleService } from './tele.service.js';
import {
  CreateSessionDto,
  JoinSessionDto,
  PostSignalDto,
} from './dto/tele.dto.js';

@ApiTags('tele')
@ApiBearerAuth('jwt')
@Controller('tele')
export class TeleController {
  constructor(private readonly tele: TeleService) {}

  // ── Provider: lifecycle ──────────────────────────

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TELE_HOST)
  @Audit({ action: 'tele.sessionCreate', entity: 'TeleSession', entityIdFrom: 'result:id' })
  create(@Body() dto: CreateSessionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tele.create(dto, user);
  }

  @Get('sessions/:id')
  @Requires(Actions.TELE_HOST)
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tele.getByIdForProvider(id, user);
  }

  @Post('sessions/:id/end')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TELE_HOST)
  @Audit({ action: 'tele.sessionEnd', entity: 'TeleSession', entityIdFrom: 'param:id' })
  end(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tele.end(id, user);
  }

  // ── Patient: join (Public — bearer is the joinToken in the link) ──

  @Public()
  @Post('join')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'tele.join', entity: 'TeleSession', entityIdFrom: 'result:id' })
  join(@Body() dto: JoinSessionDto) {
    return this.tele.join(dto.joinToken);
  }

  /**
   * Patient consent stamp. Public + X-Tele-Token because the patient may
   * not have a portal account; we trust the token they got at /join. Audited
   * — important for DPA Sec 12 lawful processing if the recording is ever
   * subpoenaed.
   */
  @Public()
  @Post('sessions/:id/recording-consent')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'X-Tele-Token', required: true })
  @Audit({ action: 'tele.recordingConsent', entity: 'TeleSession', entityIdFrom: 'param:id' })
  async setRecordingConsent(
    @Param('id') id: string,
    @Body() dto: { granted: boolean },
    @Headers('x-tele-token') patientToken: string | undefined,
  ) {
    if (!patientToken) throw new BadRequestException('missing X-Tele-Token');
    if (typeof dto?.granted !== 'boolean') {
      throw new BadRequestException('granted must be a boolean');
    }
    const updated = await this.tele.setRecordingConsent(id, dto.granted, patientToken);
    return {
      granted: dto.granted,
      recordingConsentAt: updated.recordingConsentAt,
      recordingDeclinedAt: updated.recordingDeclinedAt,
    };
  }

  // ── ICE / TURN config (Public so patient browser can fetch it) ──

  @Public()
  @Get('ice')
  ice() {
    return this.tele.iceConfig();
  }

  // ── Signaling (dual auth: JWT provider OR X-Tele-Token patient) ──

  @Public()
  @Get('sessions/:id/signals')
  @ApiQuery({ name: 'since', required: false, type: String })
  @ApiHeader({ name: 'X-Tele-Token', required: true })
  async pollSignals(
    @Param('id') id: string,
    @Query('since') since: string | undefined,
    @Headers('authorization') authHeader: string | undefined,
    @Headers('x-tele-token') patientToken: string | undefined,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    const cursor = Number(since ?? 0);
    if (!Number.isFinite(cursor) || cursor < 0) {
      throw new BadRequestException('invalid since cursor');
    }
    // The route is @Public so the JwtAuthGuard short-circuits, meaning
    // CurrentUser is undefined here even when a Bearer is present. We treat
    // patientToken as the only auth source on this endpoint; provider polling
    // should fall through to the dedicated signaling-as-provider variant below.
    void authHeader;
    void user;
    if (!patientToken) throw new BadRequestException('missing X-Tele-Token');
    return this.tele.listSignals(id, cursor, { kind: 'patient', token: patientToken });
  }

  @Get('sessions/:id/signals/provider')
  @Requires(Actions.TELE_HOST)
  @ApiQuery({ name: 'since', required: false, type: String })
  pollSignalsProvider(
    @Param('id') id: string,
    @Query('since') since: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const cursor = Number(since ?? 0);
    if (!Number.isFinite(cursor) || cursor < 0) {
      throw new BadRequestException('invalid since cursor');
    }
    return this.tele.listSignals(id, cursor, { kind: 'provider', user });
  }

  @Public()
  @Post('sessions/:id/signals')
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: 'X-Tele-Token', required: true })
  postSignalPatient(
    @Param('id') id: string,
    @Body() dto: PostSignalDto,
    @Headers('x-tele-token') patientToken: string | undefined,
  ) {
    if (!patientToken) throw new BadRequestException('missing X-Tele-Token');
    return this.tele.postSignal(id, dto.kind, dto.payload, {
      kind: 'patient',
      token: patientToken,
    });
  }

  @Post('sessions/:id/signals/provider')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TELE_HOST)
  postSignalProvider(
    @Param('id') id: string,
    @Body() dto: PostSignalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tele.postSignal(id, dto.kind, dto.payload, {
      kind: 'provider',
      user,
    });
  }
}
