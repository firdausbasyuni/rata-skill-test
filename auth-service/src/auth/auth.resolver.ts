import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';

import { AuthService } from './auth.service.js';
import { RegisterInput } from './dto/register.input.js';
import { LoginInput } from './dto/login.input.js';
import { AuthResponse } from './models/auth-response.model.js';
import { UserModel } from './models/user.model.js';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Query(() => String, { name: 'health' })
  health(): string {
    return 'Auth Service is running';
  }

  @Mutation(() => AuthResponse)
  register(@Args('input') input: RegisterInput): Promise<AuthResponse> {
    return this.authService.register(input);
  }

  @Mutation(() => AuthResponse)
  login(@Args('input') input: LoginInput): Promise<AuthResponse> {
    return this.authService.login(input);
  }

  @Query(() => UserModel)
  validateToken(@Args('token') token: string): Promise<UserModel> {
    return this.authService.validateToken(token);
  }
}
