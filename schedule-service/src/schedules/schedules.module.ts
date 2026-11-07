import { Module } from '@nestjs/common';
import { SchedulesResolver } from './schedules.resolver.js';
import { SchedulesService } from './schedules.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  providers: [SchedulesResolver, SchedulesService],
})
export class SchedulesModule {}
