import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthService } from './auth.service.js';

@Module({
  imports: [HttpModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
