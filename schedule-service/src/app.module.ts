import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { HttpModule } from '@nestjs/axios';
import { join } from 'path';
import { Request } from 'express';

import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AppResolver } from './app.resolver.js';
import { AuthModule } from './auth/auth.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { AuditModule } from './audit/audit.module.js';
import { DoctorsModule } from './doctors/doctors.module.js';
import { SchedulesModule } from './schedules/schedules.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: true,
      context: ({ req }: { req: Request }) => ({ req }),

      includeStacktraceInErrorResponses: process.env.NODE_ENV !== 'production',

      formatError: (formattedError) => {
        const originalError = formattedError.extensions?.originalError as
          { statusCode?: number } | undefined;

        const statusCode = originalError?.statusCode;

        const errorCodes: Record<number, string> = {
          400: 'BAD_REQUEST',
          401: 'UNAUTHORIZED',
          403: 'FORBIDDEN',
          404: 'NOT_FOUND',
          409: 'CONFLICT',
          503: 'SERVICE_UNAVAILABLE',
        };

        return {
          ...formattedError,
          extensions: {
            ...formattedError.extensions,
            ...(statusCode && {
              code: errorCodes[statusCode] ?? 'INTERNAL_SERVER_ERROR',
            }),
          },
        };
      },
    }),

    HttpModule,

    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'schedule-service',
    }),

    PrismaModule,
    AuthModule,
    CustomersModule,
    AuditModule,
    DoctorsModule,
    SchedulesModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppResolver],
})
export class AppModule {}
