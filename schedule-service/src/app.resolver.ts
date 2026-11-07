import { Resolver, Query, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';

import { GqlAuthGuard } from './auth/guards/gql-auth.guard.js';
import { AuthenticatedUser } from './auth/interfaces/authenticated-user.interface.js';

interface GraphQLContext {
  req: {
    user?: AuthenticatedUser;
  };
}

@Resolver()
export class AppResolver {
  @Query(() => String, { name: 'health' })
  health(): string {
    return 'Schedule Service is running';
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => String, { name: 'protectedHealth' })
  protectedHealth(@Context() context: GraphQLContext): string {
    return `Hello ${context.req.user?.email}, Schedule Service is authenticated`;
  }
}
