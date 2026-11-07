import { Module } from '@nestjs/common';
import { DoctorsResolver } from './doctors.resolver.js';
import { DoctorsService } from './doctors.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  providers: [DoctorsResolver, DoctorsService],
})
export class DoctorsModule {}
