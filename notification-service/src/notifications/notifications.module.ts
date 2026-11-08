import { Module } from '@nestjs/common';
import { EmailProcessor } from './email.processor.js';

@Module({
  providers: [EmailProcessor],
})
export class NotificationsModule {}