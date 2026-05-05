import { Global, Module } from '@nestjs/common';
import { AiClientService } from './ai-client.service.js';

@Global()
@Module({
  providers: [AiClientService],
  exports: [AiClientService],
})
export class AiClientModule {}
