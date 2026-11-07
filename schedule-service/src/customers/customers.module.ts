import { Module } from '@nestjs/common';
import { CustomersResolver } from './customers.resolver.js';
import { CustomersService } from './customers.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  providers: [CustomersResolver, CustomersService],
})
export class CustomersModule {}
