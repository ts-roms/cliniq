import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailerModule } from '../mailer/mailer.module.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

@Module({
  imports: [AuthModule, MailerModule],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
