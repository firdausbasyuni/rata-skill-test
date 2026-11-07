import { ObjectType, Field, Int } from '@nestjs/graphql';
import { ScheduleModel } from './schedule.model.js';

@ObjectType()
export class ScheduleConnection {
  @Field(() => [ScheduleModel])
  items: ScheduleModel[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  skip: number;

  @Field(() => Int)
  take: number;
}
