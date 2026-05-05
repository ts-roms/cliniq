import { Global, Module } from '@nestjs/common';
import { BedrockService } from './bedrock.service.js';

@Global()
@Module({
  providers: [BedrockService],
  exports: [BedrockService],
})
export class BedrockModule {}
