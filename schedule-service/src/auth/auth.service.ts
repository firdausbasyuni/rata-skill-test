import {
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { AuthenticatedUser } from './interfaces/authenticated-user.interface.js';

interface ValidateTokenResponse {
  data?: {
    validateToken: AuthenticatedUser;
  };
  errors?: Array<{
    message: string;
  }>;
}

@Injectable()
export class AuthService {
  private readonly authServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.authServiceUrl =
      this.configService.getOrThrow<string>('AUTH_SERVICE_URL');
  }

  async validateToken(token: string): Promise<AuthenticatedUser> {
    const query = `
      query ValidateToken($token: String!) {
        validateToken(token: $token) {
          id
          email
          createdAt
          updatedAt
        }
      }
    `;

    try {
      const response = await firstValueFrom(
        this.httpService.post<ValidateTokenResponse>(
          this.authServiceUrl,
          {
            query,
            variables: { token },
          },
          {
            timeout: 5000,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      if (response.data.errors?.length || !response.data.data?.validateToken) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      return response.data.data.validateToken;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (typeof error === 'object' && error !== null && 'response' in error) {
        const status = (error as { response?: { status?: number } }).response
          ?.status;

        if (status === 401 || status === 403) {
          throw new UnauthorizedException('Invalid or expired token');
        }
      }

      throw new ServiceUnavailableException(
        'Authentication service is unavailable',
      );
    }
  }
}
