import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConsentsController } from './consents.controller.js';
import { ConsentsService } from './consents.service.js';
import { ConsentsInterceptor } from './consents.interceptor.js';

@Global()
@Module({
  controllers: [ConsentsController],
  providers: [
    ConsentsService,
    { provide: APP_INTERCEPTOR, useClass: ConsentsInterceptor },
  ],
  exports: [ConsentsService],
})
export class ConsentsModule {}
