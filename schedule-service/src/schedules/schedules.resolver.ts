import {
  Resolver,
  Query,
  Mutation,
  Args,
  Int,
  ID,
  Context,
} from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';

import { SchedulesService } from './schedules.service.js';
import { ScheduleModel } from './models/schedule.model.js';
import { ScheduleConnection } from './models/schedule-connection.model.js';
import { CreateScheduleInput } from './dto/create-schedule.input.js';
import { UpdateScheduleInput } from './dto/update-schedule.input.js';
import { ScheduleFilterInput } from './dto/schedule-filter.input.js';

import { GqlAuthGuard } from '../auth/guards/gql-auth.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';

@Resolver(() => ScheduleModel)
@UseGuards(GqlAuthGuard)
export class SchedulesResolver {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Mutation(() => ScheduleModel)
  createSchedule(
    @Args('input') input: CreateScheduleInput,
    @Context() context: { req: { user: AuthenticatedUser } },
  ) {
    return this.schedulesService.create(input, context.req.user.id);
  }

  @Query(() => ScheduleConnection)
  schedules(
    @Args('skip', { type: () => Int, nullable: true, defaultValue: 0 })
    skip: number,
    @Args('take', { type: () => Int, nullable: true, defaultValue: 20 })
    take: number,
    @Args('filters', { type: () => ScheduleFilterInput, nullable: true })
    filters?: ScheduleFilterInput,
  ) {
    return this.schedulesService.findAll(skip, take, filters);
  }

  @Query(() => ScheduleModel)
  schedule(@Args('id', { type: () => ID }) id: string) {
    return this.schedulesService.findOne(id);
  }

  @Mutation(() => ScheduleModel)
  updateSchedule(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateScheduleInput,
    @Context() context: { req: { user: AuthenticatedUser } },
  ) {
    return this.schedulesService.update(id, input, context.req.user.id);
  }

  @Mutation(() => Boolean)
  deleteSchedule(
    @Args('id', { type: () => ID }) id: string,
    @Context() context: { req: { user: AuthenticatedUser } },
  ) {
    return this.schedulesService.remove(id, context.req.user.id);
  }
}
