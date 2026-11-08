import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DoctorsService } from './doctors.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('DoctorsService', () => {
  let service: DoctorsService;

  const doctorId = '29cb5396-4170-4b9c-beeb-82a2154e851c';
  const userId = '09b31c1f-7c49-436a-b83f-45dbb8faa311';
  const invalidUUID = 'Y123456';

  const doctor = {
    id: doctorId,
    name: 'Dr. John Smith',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    deletedBy: null,
  };

  const tx = {
    doctor: {
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  const prisma = {
    doctor: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    tx.doctor.create.mockResolvedValue(doctor);
    tx.doctor.update.mockResolvedValue(doctor);
    tx.auditLog.create.mockResolvedValue({});

    prisma.doctor.findMany.mockResolvedValue([doctor]);
    prisma.doctor.findFirst.mockResolvedValue(doctor);

    service = new DoctorsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('should create a doctor and audit log', async () => {
      const result = await service.create({ name: 'Dr. John Smith' }, userId);

      expect(result).toEqual(doctor);

      expect(tx.doctor.create).toHaveBeenCalledWith({
        data: {
          name: 'Dr. John Smith',
        },
      });

      expect(tx.auditLog.create).toHaveBeenCalled();
    });

    it('should reject an invalid user UUID', async () => {
      await expect(
        service.create({ name: 'Dr. John Smith' }, invalidUUID),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return active doctors', async () => {
      const result = await service.findAll();

      expect(result).toEqual([doctor]);

      expect(prisma.doctor.findMany).toHaveBeenCalledWith({
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
    it('should return a doctor by ID', async () => {
      const result = await service.findOne(doctorId);

      expect(result).toEqual(doctor);

      expect(prisma.doctor.findFirst).toHaveBeenCalledWith({
        where: {
          id: doctorId,
          deletedAt: null,
        },
      });
    });

    it('should reject an invalid UUID', async () => {
      await expect(service.findOne(invalidUUID)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.doctor.findFirst).not.toHaveBeenCalled();
    });

    it('should throw when doctor does not exist', async () => {
      prisma.doctor.findFirst.mockResolvedValue(null);

      await expect(service.findOne(doctorId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a doctor and create an audit log', async () => {
      const result = await service.update(
        doctorId,
        { name: 'Dr. Updated Name' },
        userId,
      );

      expect(result).toEqual(doctor);

      expect(tx.doctor.update).toHaveBeenCalledWith({
        where: {
          id: doctorId,
        },
        data: {
          name: 'Dr. Updated Name',
        },
      });

      expect(tx.auditLog.create).toHaveBeenCalled();
    });

    it('should reject an invalid doctor UUID', async () => {
      await expect(
        service.update(invalidUUID, { name: 'Dr. Updated Name' }, userId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.doctor.findFirst).not.toHaveBeenCalled();
    });

    it('should reject an invalid user UUID', async () => {
      await expect(
        service.update(doctorId, { name: 'Dr. Updated Name' }, invalidUUID),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.doctor.findFirst).not.toHaveBeenCalled();
    });

    it('should throw when doctor does not exist', async () => {
      prisma.doctor.findFirst.mockResolvedValue(null);

      await expect(
        service.update(doctorId, { name: 'Dr. Updated Name' }, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft-delete a doctor and create an audit log', async () => {
      const result = await service.remove(doctorId, userId);

      expect(result).toBe(true);

      expect(tx.doctor.update).toHaveBeenCalledWith({
        where: {
          id: doctorId,
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
          entity: 'DOCTOR',
          entityId: doctorId,
        }),
      });
    });

    it('should reject an invalid doctor UUID', async () => {
      await expect(service.remove(invalidUUID, userId)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.doctor.findFirst).not.toHaveBeenCalled();
    });

    it('should reject an invalid user UUID', async () => {
      await expect(service.remove(doctorId, invalidUUID)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.doctor.findFirst).not.toHaveBeenCalled();
    });

    it('should throw when doctor does not exist', async () => {
      prisma.doctor.findFirst.mockResolvedValue(null);

      await expect(service.remove(doctorId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
