import { InputType, Field } from '@nestjs/graphql';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsDateString,
  MaxLength,
} from 'class-validator';

@InputType()
export class CreateScheduleInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  objective: string;

  @Field()
  @IsUUID()
  customerId: string;

  @Field()
  @IsUUID()
  doctorId: string;

  @Field()
  @IsDateString()
  scheduledAt: string;
}
