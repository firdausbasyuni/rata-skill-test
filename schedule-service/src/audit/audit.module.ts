import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service.js';
import { AuditResolver } from './audit.resolver.js';
import { AuthModule } from '../auth/auth.module.js';

@Global()
@Module({
  imports: [AuthModule],
  providers: [AuditService, AuditResolver],
  exports: [AuditService],
})
export class AuditModule {}
