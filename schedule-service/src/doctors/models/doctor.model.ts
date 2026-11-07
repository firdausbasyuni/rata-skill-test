import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class DoctorModel {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}
