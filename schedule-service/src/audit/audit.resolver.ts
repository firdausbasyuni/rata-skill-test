import { Resolver, Query, Args, Int, ID } from '@nestjs/graphql';
import { UseGuards, BadRequestException } from '@nestjs/common';

import { AuditService } from './audit.service.js';
import { AuditLogConnection } from './models/audit-log.model.js';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';

function validatePagination(skip: number, take: number): void {
  if (!Number.isInteger(skip) || skip < 0) {
    throw new BadRequestException('skip must be a non-negative integer');
  }

  if (!Number.isInteger(take) || take < 1 || take > 100) {
    throw new BadRequestException('take must be between 1 and 100');
  }
}

@Resolver()
@UseGuards(GqlAuthGuard)
export class AuditResolver {
  constructor(private readonly auditService: AuditService) {}

  @Query(() => AuditLogConnection)
  auditLogs(
    @Args('skip', {
      type: () => Int,
      defaultValue: 0,
    })
    skip: number,

    @Args('take', {
      type: () => Int,
      defaultValue: 20,
    })
    take: number,
  ) {
    validatePagination(skip, take);

    return this.auditService.findAll(skip, take);
  }

  @Query(() => AuditLogConnection)
  auditLogsByEntity(
    @Args('entity')
    entity: string,

    @Args('entityId', {
      type: () => ID,
    })
    entityId: string,

    @Args('skip', {
      type: () => Int,
      defaultValue: 0,
    })
    skip: number,

    @Args('take', {
      type: () => Int,
      defaultValue: 20,
    })
    take: number,
  ) {
    validatePagination(skip, take);

    return this.auditService.findByEntity(entity, entityId, skip, take);
  }

  @Query(() => AuditLogConnection)
  myAuditLogs(
    @CurrentUser() user: AuthenticatedUser,

    @Args('skip', {
      type: () => Int,
      defaultValue: 0,
    })
    skip: number,

    @Args('take', {
      type: () => Int,
      defaultValue: 20,
    })
    take: number,
  ) {
    validatePagination(skip, take);

    return this.auditService.findByUser(user.id, skip, take);
  }
}
