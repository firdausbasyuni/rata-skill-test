import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

import { SchedulesResolver } from './schedules.resolver.js';
import { SchedulesService } from './schedules.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
  ],
  providers: [SchedulesResolver, SchedulesService],
})
export class SchedulesModule {}
