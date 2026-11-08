import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;

  private readonly scheduleCacheVersionKey = 'cache:schedules:version';

  private readonly defaultTtl = 30;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: Number(this.configService.get<string>('REDIS_PORT', '6380')),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times: number) => Math.min(times * 500, 3000),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.redis.connect();
      this.logger.log('Redis cache connection established');
    } catch (error) {
      this.logger.error(
        'Unable to connect to Redis cache',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);

      if (!value) {
        return null;
      }

      return JSON.parse(value, (_key, value: unknown) => {
        if (
          typeof value === 'string' &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
        ) {
          const date = new Date(value);

          if (!Number.isNaN(date.getTime())) {
            return date;
          }
        }

        return value;
      }) as T;
    } catch (error) {
      this.logger.warn(`Cache GET failed for ${key}: ${String(error)}`);

      return null;
    }
  }

  async set(key: string, value: unknown, ttl = this.defaultTtl): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (error) {
      this.logger.warn(`Cache SET failed for ${key}: ${String(error)}`);
    }
  }

  async getScheduleCacheVersion(): Promise<string> {
    try {
      return (await this.redis.get(this.scheduleCacheVersionKey)) ?? '0';
    } catch (error) {
      this.logger.warn(
        `Unable to read schedule cache version: ${String(error)}`,
      );
      return '0';
    }
  }

  async invalidateSchedules(): Promise<void> {
    try {
      await this.redis.incr(this.scheduleCacheVersionKey);
      this.logger.log('Schedule list cache invalidated');
    } catch (error) {
      this.logger.warn(`Schedule cache invalidation failed: ${String(error)}`);
    }
  }
}
