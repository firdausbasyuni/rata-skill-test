import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheService } from './cache.service.js';

type RedisOptions = {
  host: string;
  port: number;
  lazyConnect: boolean;
  maxRetriesPerRequest: number;
  retryStrategy: (times: number) => number;
};

const { redisMock } = vi.hoisted(() => ({
  redisMock: {
    connect: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
    quit: vi.fn(),
    status: 'wait' as string,
  },
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn(function RedisMock() {
    return redisMock;
  }),
}));

describe('CacheService', () => {
  let service: CacheService;
  let configService: ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();

    redisMock.status = 'wait';
    redisMock.connect.mockResolvedValue(undefined);
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue('OK');
    redisMock.incr.mockResolvedValue(1);
    redisMock.quit.mockResolvedValue('OK');

    configService = {
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return '6380';
        return defaultValue;
      }),
    } as unknown as ConfigService;

    service = new CacheService(configService);
  });

  describe('constructor', () => {
    it('should initialize Redis with configured connection options', () => {
      expect(Redis).toHaveBeenCalledWith({
        host: 'localhost',
        port: 6380,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: expect.any(Function),
      });
    });

    it('should use default Redis configuration when environment values are missing', () => {
      const defaultConfig = {
        get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
      } as unknown as ConfigService;

      new CacheService(defaultConfig);

      expect(Redis).toHaveBeenLastCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 6380,
        }),
      );
    });

    it('should limit Redis retry delay to 3000 milliseconds', () => {
      const redisConstructor = vi.mocked(Redis) as unknown as {
        mock: {
          calls: Array<[options: RedisOptions]>;
        };
      };

      const options = redisConstructor.mock.calls.at(-1)![0];

      expect(options.retryStrategy(1)).toBe(500);
      expect(options.retryStrategy(3)).toBe(1500);
      expect(options.retryStrategy(6)).toBe(3000);
      expect(options.retryStrategy(10)).toBe(3000);
    });
  });

  describe('onModuleInit', () => {
    it('should connect to Redis successfully', async () => {
      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(redisMock.connect).toHaveBeenCalledOnce();
    });

    it('should handle Redis connection errors without throwing', async () => {
      redisMock.connect.mockRejectedValueOnce(
        new Error('Redis connection failed'),
      );

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(redisMock.connect).toHaveBeenCalledOnce();
    });
  });

  describe('onModuleDestroy', () => {
    it('should close Redis connection', async () => {
      redisMock.status = 'ready';

      await service.onModuleDestroy();

      expect(redisMock.quit).toHaveBeenCalledOnce();
    });

    it('should not close Redis if connection is already ended', async () => {
      redisMock.status = 'end';

      await service.onModuleDestroy();

      expect(redisMock.quit).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should return null when cache key does not exist', async () => {
      redisMock.get.mockResolvedValueOnce(null);

      await expect(service.get('test:key')).resolves.toBeNull();

      expect(redisMock.get).toHaveBeenCalledWith('test:key');
    });

    it('should return null when Redis returns an empty value', async () => {
      redisMock.get.mockResolvedValueOnce('');

      await expect(service.get('test:key')).resolves.toBeNull();
    });

    it('should parse and return cached JSON data', async () => {
      const cachedData = {
        id: '123',
        objective: 'Consultation',
      };

      redisMock.get.mockResolvedValueOnce(JSON.stringify(cachedData));

      await expect(service.get('test:key')).resolves.toEqual(cachedData);
    });

    it('should restore ISO date strings as Date objects', async () => {
      redisMock.get.mockResolvedValueOnce(
        JSON.stringify({
          id: '123',
          scheduledAt: '2026-11-14T09:00:00.000Z',
        }),
      );

      const result = await service.get<{
        id: string;
        scheduledAt: Date;
      }>('schedule:123');

      expect(result?.scheduledAt).toBeInstanceOf(Date);
      expect(result?.scheduledAt.toISOString()).toBe(
        '2026-11-14T09:00:00.000Z',
      );
    });

    it('should preserve strings that are not ISO date values', async () => {
      redisMock.get.mockResolvedValueOnce(
        JSON.stringify({
          value: 'not-a-date',
        }),
      );

      await expect(service.get('test:key')).resolves.toEqual({
        value: 'not-a-date',
      });
    });

    it('should return null when JSON parsing fails', async () => {
      redisMock.get.mockResolvedValueOnce('invalid-json');

      await expect(service.get('test:key')).resolves.toBeNull();
    });

    it('should return null when Redis GET fails', async () => {
      redisMock.get.mockRejectedValueOnce(new Error('Redis unavailable'));

      await expect(service.get('test:key')).resolves.toBeNull();
    });
  });

  describe('set', () => {
    it('should store JSON data using the default TTL', async () => {
      const data = {
        id: '123',
        objective: 'Consultation',
      };

      await service.set('test:key', data);

      expect(redisMock.set).toHaveBeenCalledWith(
        'test:key',
        JSON.stringify(data),
        'EX',
        30,
      );
    });

    it('should store data using a custom TTL', async () => {
      await service.set('test:key', { value: 'test' }, 60);

      expect(redisMock.set).toHaveBeenCalledWith(
        'test:key',
        JSON.stringify({ value: 'test' }),
        'EX',
        60,
      );
    });

    it('should handle Redis SET failures without throwing', async () => {
      redisMock.set.mockRejectedValueOnce(new Error('Redis unavailable'));

      await expect(
        service.set('test:key', { value: 'test' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('getScheduleCacheVersion', () => {
    it('should return the current cache version', async () => {
      redisMock.get.mockResolvedValueOnce('5');

      await expect(service.getScheduleCacheVersion()).resolves.toBe('5');

      expect(redisMock.get).toHaveBeenCalledWith('cache:schedules:version');
    });

    it('should return version 0 when no version exists', async () => {
      redisMock.get.mockResolvedValueOnce(null);

      await expect(service.getScheduleCacheVersion()).resolves.toBe('0');
    });

    it('should return version 0 when Redis GET fails', async () => {
      redisMock.get.mockRejectedValueOnce(new Error('Redis unavailable'));

      await expect(service.getScheduleCacheVersion()).resolves.toBe('0');
    });
  });

  describe('invalidateSchedules', () => {
    it('should increment the schedule cache version', async () => {
      await service.invalidateSchedules();

      expect(redisMock.incr).toHaveBeenCalledWith('cache:schedules:version');
    });

    it('should handle Redis INCR failures without throwing', async () => {
      redisMock.incr.mockRejectedValueOnce(new Error('Redis unavailable'));

      await expect(service.invalidateSchedules()).resolves.toBeUndefined();
    });
  });
});
