import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomersService } from './customers.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('CustomersService', () => {
  let service: CustomersService;

  const customerId = '75e712f0-8133-4d10-b5a3-e1c1f0c58d72';
  const userId = '09b31c1f-7c49-436a-b83f-45dbb8faa311';
  const invalidUUID = 'Y123456';

  const customer = {
    id: customerId,
    name: 'John Customer',
    email: 'john@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    deletedBy: null,
  };

  const tx = {
    customer: {
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  const prisma = {
    customer: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    tx.customer.create.mockResolvedValue(customer);
    tx.customer.update.mockResolvedValue(customer);
    tx.auditLog.create.mockResolvedValue({});

    prisma.customer.findMany.mockResolvedValue([customer]);
    prisma.customer.findFirst.mockResolvedValue(customer);

    service = new CustomersService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('should create a customer and audit log', async () => {
      const result = await service.create(
        {
          name: 'John Customer',
          email: ' JOHN@EXAMPLE.COM ',
        },
        userId,
      );

      expect(result).toEqual(customer);

      expect(tx.customer.create).toHaveBeenCalledWith({
        data: {
          name: 'John Customer',
          email: 'john@example.com',
        },
      });

      expect(tx.auditLog.create).toHaveBeenCalled();
    });

    it('should reject an invalid user UUID', async () => {
      await expect(
        service.create(
          {
            name: 'John Customer',
            email: 'john@example.com',
          },
          invalidUUID,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject duplicate email', async () => {
      const error = new Error('Unique constraint failed');
      Object.assign(error, { code: 'P2002' });

      tx.customer.create.mockRejectedValue(error);

      await expect(
        service.create(
          {
            name: 'John Customer',
            email: 'john@example.com',
          },
          userId,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return active customers', async () => {
      const result = await service.findAll();

      expect(result).toEqual([customer]);

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return a customer by ID', async () => {
      const result = await service.findOne(customerId);

      expect(result).toEqual(customer);

      expect(prisma.customer.findFirst).toHaveBeenCalledWith({
        where: {
          id: customerId,
          deletedAt: null,
        },
      });
    });

    it('should reject an invalid UUID', async () => {
      await expect(service.findOne(invalidUUID)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    });

    it('should throw when customer does not exist', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.findOne(customerId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a customer and create an audit log', async () => {
      const result = await service.update(
        customerId,
        {
          name: 'Updated Customer',
        },
        userId,
      );

      expect(result).toEqual(customer);

      expect(tx.customer.update).toHaveBeenCalledWith({
        where: {
          id: customerId,
        },
        data: {
          name: 'Updated Customer',
        },
      });

      expect(tx.auditLog.create).toHaveBeenCalled();
    });

    it('should reject an invalid customer UUID', async () => {
      await expect(
        service.update(invalidUUID, { name: 'Updated Customer' }, userId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    });

    it('should reject an invalid user UUID', async () => {
      await expect(
        service.update(customerId, { name: 'Updated Customer' }, invalidUUID),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    });

    it('should throw when customer does not exist', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.update(customerId, { name: 'Updated Customer' }, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject duplicate email', async () => {
      const error = new Error('Unique constraint failed');
      Object.assign(error, { code: 'P2002' });

      tx.customer.update.mockRejectedValue(error);

      await expect(
        service.update(customerId, { email: 'duplicate@example.com' }, userId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should soft-delete a customer and create an audit log', async () => {
      const result = await service.remove(customerId, userId);

      expect(result).toBe(true);

      expect(tx.customer.update).toHaveBeenCalledWith({
        where: {
          id: customerId,
        },
        data: expect.objectContaining({
          deletedBy: userId,
          deletedAt: expect.any(Date),
        }),
      });

      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          action: 'DELETE',
          entity: 'CUSTOMER',
          entityId: customerId,
        }),
      });
    });

    it('should reject an invalid customer UUID', async () => {
      await expect(service.remove(invalidUUID, userId)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    });

    it('should reject an invalid user UUID', async () => {
      await expect(service.remove(customerId, invalidUUID)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    });

    it('should throw when customer does not exist', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.remove(customerId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
