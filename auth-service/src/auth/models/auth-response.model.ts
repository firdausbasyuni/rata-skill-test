import { ObjectType, Field, Int } from '@nestjs/graphql';
import { UserModel } from './user.model.js';

@ObjectType()
export class AuthResponse {
  @Field()
  accessToken: string;

  @Field()
  tokenType: string;

  @Field(() => Int)
  expiresIn: number;

  @Field(() => UserModel)
  user: UserModel;
}
