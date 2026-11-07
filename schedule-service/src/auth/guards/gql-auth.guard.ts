import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthService } from '../auth.service.js';

interface GraphQLContext {
  req: {
    headers: {
      authorization?: string;
    };
    user?: unknown;
  };
}

@Injectable()
export class GqlAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const ctx = gqlContext.getContext<GraphQLContext>();
    const authorization = ctx.req.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization token is required');
    }

    const token = authorization.substring(7).trim();

    if (!token) {
      throw new UnauthorizedException('Authorization token is required');
    }

    const user = await this.authService.validateToken(token);

    ctx.req.user = user;

    return true;
  }
}
