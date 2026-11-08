import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bull';

import { SchedulesService } from './schedules.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CacheService } from '../cache/cache.service.js';

describe('SchedulesService', () => {
  let schedulesService: SchedulesService;

  const mockPrisma = {
    $transaction: vi.fn(),
    customer: {
      findFirst: vi.fn(),
    },
    doctor: {
      findFirst: vi.fn(),
    },
    schedule: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  const mockEmailQueue = {
    add: vi.fn().mockResolvedValue({ id: 'test-job-1' }),
  };

  const mockCacheService = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    getScheduleCacheVersion: vi.fn().mockResolvedValue('0'),
    invalidateSchedules: vi.fn().mockResolvedValue(undefined),
  };

  const mockTransaction = {
    customer: {
      findFirst: vi.fn(),
    },
    doctor: {
      findFirst: vi.fn(),
    },
    schedule: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  const customerId = '75e712f0-8133-4d10-b5a3-e1c1f0c58d72';
  const doctorId = '29cb5396-4170-4b9c-beeb-82a2154e851c';
  const scheduleId = 'ad4b3ed6-fe37-42aa-bc29-dbf311a2a1fe';
  const userId = '09b31c1f-7c49-436a-b83f-45dbb8faa311';

  const invalidUUID = 'Y123456';

  const scheduledAt = new Date('2026-11-10T09:00:00.000Z');

  const mockCustomer = {
    id: customerId,
    name: 'Aldi',
    email: 'aldi@example.com',
    deletedAt: null,
  };

  const mockDoctor = {
    id: doctorId,
    name: 'Dr Jason Zhang',
    deletedAt: null,
  };

  const mockSchedule = {
    id: scheduleId,
    objective: 'General Consultation',
    customerId,
    doctorId,
    scheduledAt,
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    updatedAt: new Date('2026-11-01T10:00:00.000Z'),
    deletedAt: null,
    customer: mockCustomer,
    doctor: mockDoctor,
  };

  const createInput = {
    objective: 'General Consultation',
    customerId,
    doctorId,
    scheduledAt: '2026-11-10T09:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockEmailQueue.add.mockResolvedValue({ id: 'test-job-1' });

    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockResolvedValue(undefined);
    mockCacheService.getScheduleCacheVersion.mockResolvedValue('0');
    mockCacheService.invalidateSchedules.mockResolvedValue(undefined);

    schedulesService = new SchedulesService(
      mockPrisma as unknown as PrismaService,
      mockEmailQueue as unknown as Queue,
      mockCacheService as unknown as CacheService,
    );

    // Support both callback and array transactions.
    mockPrisma.$transaction.mockImplementation(async (transaction: unknown) => {
      if (typeof transaction === 'function') {
        return transaction(mockTransaction);
      }

      return Promise.all(transaction as Promise<unknown>[]);
    });
  });

  describe('create', () => {
    it('should create a schedule and write an audit log', async () => {
      mockTransaction.customer.findFirst.mockResolvedValue(mockCustomer);
      mockTransaction.doctor.findFirst.mockResolvedValue(mockDoctor);
      mockTransaction.schedule.create.mockResolvedValue(mockSchedule);
      mockTransaction.auditLog.create.mockResolvedValue({});

      const result = await schedulesService.create(createInput, userId);

      expect(mockTransaction.customer.findFirst).toHaveBeenCalledWith({
        where: {
          id: customerId,
          deletedAt: null,
        },
      });

      expect(mockTransaction.doctor.findFirst).toHaveBeenCalledWith({
        where: {
          id: doctorId,
          deletedAt: null,
        },
      });

      expect(mockTransaction.schedule.create).toHaveBeenCalledWith({
        data: {
          objective: createInput.objective,
          customerId,
          doctorId,
          scheduledAt,
        },
        include: {
          customer: true,
          doctor: true,
        },
      });

      expect(mockTransaction.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            action: 'CREATE',
            entity: 'SCHEDULE',
            entityId: scheduleId,
          }),
        }),
      );

      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'send',
        expect.objectContaining({
          to: mockCustomer.email,
          subject: 'Your appointment has been scheduled',
        }),
      );

      expect(mockCacheService.invalidateSchedules).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockSchedule);
    });

    it('should reject an invalid customer UUID', async () => {
      await expect(
        schedulesService.create(
          { ...createInput, customerId: invalidUUID },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject an invalid doctor UUID', async () => {
      await expect(
        schedulesService.create(
          { ...createInput, doctorId: invalidUUID },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject an invalid user UUID', async () => {
      await expect(
        schedulesService.create(createInput, invalidUUID),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject creation when the customer does not exist', async () => {
      mockTransaction.customer.findFirst.mockResolvedValue(null);

      await expect(
        schedulesService.create(createInput, userId),
      ).rejects.toThrow(NotFoundException);

      expect(mockTransaction.schedule.create).not.toHaveBeenCalled();
      expect(mockTransaction.auditLog.create).not.toHaveBeenCalled();
      expect(mockEmailQueue.add).not.toHaveBeenCalled();
      expect(mockCacheService.invalidateSchedules).not.toHaveBeenCalled();
    });

    it('should reject creation when the doctor does not exist', async () => {
      mockTransaction.customer.findFirst.mockResolvedValue(mockCustomer);
      mockTransaction.doctor.findFirst.mockResolvedValue(null);

      await expect(
        schedulesService.create(createInput, userId),
      ).rejects.toThrow(NotFoundException);

      expect(mockTransaction.schedule.create).not.toHaveBeenCalled();
      expect(mockTransaction.auditLog.create).not.toHaveBeenCalled();
      expect(mockEmailQueue.add).not.toHaveBeenCalled();
      expect(mockCacheService.invalidateSchedules).not.toHaveBeenCalled();
    });

    it('should reject an invalid scheduled date', async () => {
      await expect(
        schedulesService.create(
          {
            ...createInput,
            scheduledAt: 'invalid-date',
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject a duplicate doctor booking', async () => {
      mockTransaction.customer.findFirst.mockResolvedValue(mockCustomer);
      mockTransaction.doctor.findFirst.mockResolvedValue(mockDoctor);

      mockTransaction.schedule.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(
        schedulesService.create(createInput, userId),
      ).rejects.toThrow(ConflictException);

      expect(mockEmailQueue.add).not.toHaveBeenCalled();
      expect(mockCacheService.invalidateSchedules).not.toHaveBeenCalled();
    });

    it('should not fail schedule creation when email enqueueing fails', async () => {
      mockTransaction.customer.findFirst.mockResolvedValue(mockCustomer);
      mockTransaction.doctor.findFirst.mockResolvedValue(mockDoctor);
      mockTransaction.schedule.create.mockResolvedValue(mockSchedule);
      mockTransaction.auditLog.create.mockResolvedValue({});

      mockEmailQueue.add.mockRejectedValue(
        new Error('Redis queue unavailable'),
      );

      const result = await schedulesService.create(createInput, userId);

      expect(result).toEqual(mockSchedule);
      expect(mockCacheService.invalidateSchedules).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll', () => {
    it('should return schedules with pagination metadata', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([mockSchedule]);
      mockPrisma.schedule.count.mockResolvedValue(1);

      const result = await schedulesService.findAll(0, 20);

      expect(mockCacheService.getScheduleCacheVersion).toHaveBeenCalled();
      expect(mockCacheService.get).toHaveBeenCalled();

      expect(mockPrisma.schedule.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
        },
        skip: 0,
        take: 20,
        orderBy: {
          scheduledAt: 'asc',
        },
        include: {
          customer: true,
          doctor: true,
        },
      });

      expect(mockCacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('schedules:v0:'),
        {
          items: [mockSchedule],
          total: 1,
          skip: 0,
          take: 20,
        },
        30,
      );

      expect(result).toEqual({
        items: [mockSchedule],
        total: 1,
        skip: 0,
        take: 20,
      });
    });

    it('should return cached schedules without querying the database', async () => {
      const cachedResult = {
        items: [mockSchedule],
        total: 1,
        skip: 0,
        take: 20,
      };

      mockCacheService.get.mockResolvedValue(cachedResult);

      const result = await schedulesService.findAll(0, 20);

      expect(result).toEqual(cachedResult);
      expect(mockPrisma.schedule.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.schedule.count).not.toHaveBeenCalled();
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });

    it('should apply customer, doctor, and date filters', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([mockSchedule]);
      mockPrisma.schedule.count.mockResolvedValue(1);

      await schedulesService.findAll(0, 10, {
        customerId,
        doctorId,
        from: '2026-11-10T00:00:00.000Z',
        to: '2026-11-10T23:59:59.000Z',
      });

      expect(mockPrisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            customerId,
            doctorId,
            scheduledAt: {
              gte: new Date('2026-11-10T00:00:00.000Z'),
              lte: new Date('2026-11-10T23:59:59.000Z'),
            },
          },
        }),
      );
    });

    it('should reject an invalid customer UUID filter', async () => {
      await expect(
        schedulesService.findAll(0, 20, {
          customerId: invalidUUID,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockCacheService.getScheduleCacheVersion).not.toHaveBeenCalled();
      expect(mockPrisma.schedule.findMany).not.toHaveBeenCalled();
    });

    it('should reject an invalid doctor UUID filter', async () => {
      await expect(
        schedulesService.findAll(0, 20, {
          doctorId: invalidUUID,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockCacheService.getScheduleCacheVersion).not.toHaveBeenCalled();
      expect(mockPrisma.schedule.findMany).not.toHaveBeenCalled();
    });

    it('should reject invalid pagination values', async () => {
      await expect(schedulesService.findAll(-1, 20)).rejects.toThrow(
        BadRequestException,
      );

      await expect(schedulesService.findAll(0, 0)).rejects.toThrow(
        BadRequestException,
      );

      await expect(schedulesService.findAll(0, 101)).rejects.toThrow(
        BadRequestException,
      );

      await expect(schedulesService.findAll(0.5, 20)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockCacheService.get).not.toHaveBeenCalled();
      expect(mockPrisma.schedule.findMany).not.toHaveBeenCalled();
    });

    it('should reject an invalid date range', async () => {
      await expect(
        schedulesService.findAll(0, 20, {
          from: '2026-11-11T00:00:00.000Z',
          to: '2026-11-10T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockCacheService.get).not.toHaveBeenCalled();
      expect(mockPrisma.schedule.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a schedule by ID', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(mockSchedule);

      const result = await schedulesService.findOne(scheduleId);

      expect(mockPrisma.schedule.findFirst).toHaveBeenCalledWith({
        where: {
          id: scheduleId,
          deletedAt: null,
        },
        include: {
          customer: true,
          doctor: true,
        },
      });

      expect(result).toEqual(mockSchedule);
    });

    it('should reject an invalid schedule UUID', async () => {
      await expect(schedulesService.findOne(invalidUUID)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrisma.schedule.findFirst).not.toHaveBeenCalled();
    });

    it('should throw when the schedule does not exist', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      await expect(schedulesService.findOne(scheduleId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a schedule and write an audit log', async () => {
      const updateInput = {
        objective: 'Annual Health Check-up',
      };

      const updatedSchedule = {
        ...mockSchedule,
        objective: 'Annual Health Check-up',
      };

      mockTransaction.schedule.findFirst.mockResolvedValue(mockSchedule);
      mockTransaction.schedule.update.mockResolvedValue(updatedSchedule);
      mockTransaction.auditLog.create.mockResolvedValue({});

      const result = await schedulesService.update(
        scheduleId,
        updateInput,
        userId,
      );

      expect(mockTransaction.schedule.update).toHaveBeenCalledWith({
        where: { id: scheduleId },
        data: {
          objective: 'Annual Health Check-up',
        },
        include: {
          customer: true,
          doctor: true,
        },
      });

      expect(mockTransaction.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            action: 'UPDATE',
            entity: 'SCHEDULE',
            entityId: scheduleId,
            details: expect.objectContaining({
              before: expect.any(Object),
              after: expect.any(Object),
            }),
          }),
        }),
      );

      expect(mockCacheService.invalidateSchedules).toHaveBeenCalledTimes(1);
      expect(result).toEqual(updatedSchedule);
    });

    it('should reject an invalid schedule UUID', async () => {
      await expect(
        schedulesService.update(
          invalidUUID,
          { objective: 'Updated objective' },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject an invalid user UUID', async () => {
      await expect(
        schedulesService.update(
          scheduleId,
          { objective: 'Updated objective' },
          invalidUUID,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject an invalid customer UUID', async () => {
      await expect(
        schedulesService.update(
          scheduleId,
          { customerId: invalidUUID },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject an invalid doctor UUID', async () => {
      await expect(
        schedulesService.update(scheduleId, { doctorId: invalidUUID }, userId),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject updating a schedule that does not exist', async () => {
      mockTransaction.schedule.findFirst.mockResolvedValue(null);

      await expect(
        schedulesService.update(
          scheduleId,
          { objective: 'Updated objective' },
          userId,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockTransaction.schedule.update).not.toHaveBeenCalled();
      expect(mockCacheService.invalidateSchedules).not.toHaveBeenCalled();
    });

    it('should reject an update with an invalid date', async () => {
      mockTransaction.schedule.findFirst.mockResolvedValue(mockSchedule);

      await expect(
        schedulesService.update(
          scheduleId,
          { scheduledAt: 'invalid-date' },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockTransaction.schedule.update).not.toHaveBeenCalled();
      expect(mockCacheService.invalidateSchedules).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft-delete a schedule and write an audit log', async () => {
      mockTransaction.schedule.findFirst.mockResolvedValue(mockSchedule);
      mockTransaction.schedule.update.mockResolvedValue({
        ...mockSchedule,
        deletedAt: new Date(),
        deletedBy: userId,
      });
      mockTransaction.auditLog.create.mockResolvedValue({});

      const result = await schedulesService.remove(scheduleId, userId);

      expect(mockTransaction.schedule.update).toHaveBeenCalledWith({
        where: { id: scheduleId },
        data: {
          deletedAt: expect.any(Date),
          deletedBy: userId,
        },
      });

      expect(mockTransaction.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            action: 'DELETE',
            entity: 'SCHEDULE',
            entityId: scheduleId,
          }),
        }),
      );

      expect(mockCacheService.invalidateSchedules).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    it('should reject an invalid schedule UUID', async () => {
      await expect(
        schedulesService.remove(invalidUUID, userId),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject an invalid user UUID', async () => {
      await expect(
        schedulesService.remove(scheduleId, invalidUUID),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject deletion when the schedule does not exist', async () => {
      mockTransaction.schedule.findFirst.mockResolvedValue(null);

      await expect(schedulesService.remove(scheduleId, userId)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockTransaction.schedule.update).not.toHaveBeenCalled();
      expect(mockTransaction.auditLog.create).not.toHaveBeenCalled();
      expect(mockCacheService.invalidateSchedules).not.toHaveBeenCalled();
    });
  });
});
