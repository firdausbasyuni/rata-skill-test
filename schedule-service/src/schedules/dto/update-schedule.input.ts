import { InputType, PartialType } from '@nestjs/graphql';
import { CreateScheduleInput } from './create-schedule.input.js';

@InputType()
export class UpdateScheduleInput extends PartialType(CreateScheduleInput) {}
