import { ObjectType, Field, ID } from '@nestjs/graphql';
import { CustomerModel } from '../../customers/models/customer.model.js';
import { DoctorModel } from '../../doctors/models/doctor.model.js';

@ObjectType()
export class ScheduleModel {
  @Field(() => ID)
  id: string;

  @Field()
  objective: string;

  @Field()
  customerId: string;

  @Field()
  doctorId: string;

  @Field()
  scheduledAt: Date;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field(() => CustomerModel)
  customer: CustomerModel;

  @Field(() => DoctorModel)
  doctor: DoctorModel;
}
