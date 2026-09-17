import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { PrismaModule } from '@org/db';
import { AllExceptionsFilter } from '../common/all-exceptions.filter.js';
import { RequestLoggingInterceptor } from '../common/request-logging.interceptor.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PatientsModule } from '../patients/patients.module.js';
import { ConsultationsModule } from '../consultations/consultations.module.js';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module.js';
import { TranscriptsModule } from '../transcripts/transcripts.module.js';
import { FilesModule } from '../files/files.module.js';
import { ConsentsModule } from '../consents/consents.module.js';
import { AiClientModule } from '../ai-client/ai-client.module.js';
import { AiBudgetModule } from '../ai-budget/ai-budget.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { MailerModule } from '../mailer/mailer.module.js';
import { SmsModule } from '../sms/sms.module.js';
import { HealthModule } from '../health/health.module.js';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { ClinicalModule } from '../clinical/clinical.module.js';
import { DentalModule } from '../dental/dental.module.js';
import { DelegationsModule } from '../delegations/delegations.module.js';
import { DrugsModule } from '../drugs/drugs.module.js';
import { IcdCodesModule } from '../icd-codes/icd-codes.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { MfaModule } from '../mfa/mfa.module.js';
import { RetentionModule } from '../retention/retention.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { DsrModule } from '../dsr/dsr.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { HmoModule } from '../hmo/hmo.module.js';
import { LabsModule } from '../labs/labs.module.js';
import { TeleModule } from '../tele/tele.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CalendarsModule } from '../calendars/calendars.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { MeModule } from '../me/me.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { LabModule } from '../lab/lab.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { ObModule } from '../ob/ob.module.js';
import { TenantContextMiddleware } from '../common/tenant-context.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Per-IP rate limit. Two tiers: a 1s burst window catches scripts that
    // pound a single endpoint, the 1m window catches steadier abuse.
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: Number(process.env.THROTTLE_SHORT_LIMIT ?? 30),
      },
      {
        name: 'medium',
        ttl: 60_000,
        limit: Number(process.env.THROTTLE_MEDIUM_LIMIT ?? 300),
      },
    ]),
    PrismaModule,
    AiClientModule,
    AiBudgetModule,
    AuditModule,
    MailerModule,
    SmsModule,
    NotificationsModule,
    WebhooksModule,
    AuthModule,
    TenantsModule,
    PatientsModule,
    ConsentsModule,
    ConsultationsModule,
    PrescriptionsModule,
    TranscriptsModule,
    FilesModule,
    AppointmentsModule,
    ClinicalModule,
    DentalModule,
    DelegationsModule,
    DrugsModule,
    IcdCodesModule,
    LocationsModule,
    MfaModule,
    RetentionModule,
    BillingModule,
    DsrModule,
    ReportsModule,
    InventoryModule,
    HmoModule,
    LabsModule,
    TeleModule,
    SettingsModule,
    CalendarsModule,
    MeModule,
    HealthModule,
    PlatformModule,
    LabModule,
    QueueModule,
    ObModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Pin Reflector locally so ThrottlerGuard (registered below as APP_GUARD)
    // resolves it from the same module scope under the Webpack bundle. Without
    // this, NestJS can fail with "Reflector at index [2] is unavailable" at
    // boot. Cheap belt-and-braces — Reflector is a singleton so re-providing
    // here doesn't fork the instance.
    Reflector,
    // useFactory form — Webpack bundle splits Reflector between modules
    // sometimes, so we hand the throttler its three deps explicitly instead
    // of trusting Nest's auto-resolution. Idiomatic per @nestjs/throttler
    // GH issues when @nestjs/core ends up in two scopes.
    {
      provide: APP_GUARD,
      useFactory: (
        options: import('@nestjs/throttler').ThrottlerModuleOptions,
        storage: import('@nestjs/throttler').ThrottlerStorage,
        reflector: Reflector,
      ) => new ThrottlerGuard(options, storage, reflector),
      inject: [
        'THROTTLER:MODULE_OPTIONS',
        ThrottlerStorage,
        Reflector,
      ],
    },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
