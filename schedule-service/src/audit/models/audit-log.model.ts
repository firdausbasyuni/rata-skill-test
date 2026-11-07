import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

@ObjectType()
export class AuditLogModel {
  @Field(() => ID)
  id: string;

  @Field()
  userId: string;

  @Field()
  action: string;

  @Field()
  entity: string;

  @Field()
  entityId: string;

  @Field(() => String, { nullable: true })
  details?: string;

  @Field()
  createdAt: Date;
}

@ObjectType()
export class AuditLogConnection {
  @Field(() => [AuditLogModel])
  items: AuditLogModel[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  skip: number;

  @Field(() => Int)
  take: number;
}
