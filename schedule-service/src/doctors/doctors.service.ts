import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateDoctorInput } from './dto/create-doctor.input.js';
import { UpdateDoctorInput } from './dto/update-doctor.input.js';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateDoctorInput, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const doctor = await tx.doctor.create({
        data: {
          name: input.name,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'CREATE',
          entity: 'DOCTOR',
          entityId: doctor.id,
          details: {
            name: doctor.name,
          },
        },
      });

      return doctor;
    });
  }

  async findAll() {
    return this.prisma.doctor.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const doctor = await this.prisma.doctor.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    return doctor;
  }

  async update(id: string, input: UpdateDoctorInput, userId: string) {
    const existingDoctor = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const doctor = await tx.doctor.update({
        where: { id },
        data: {
          ...(input.name !== undefined && {
            name: input.name,
          }),
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE',
          entity: 'DOCTOR',
          entityId: doctor.id,
          details: {
            before: {
              name: existingDoctor.name,
            },
            after: {
              name: doctor.name,
            },
          },
        },
      });

      return doctor;
    });
  }

  async remove(id: string, userId: string) {
    const existingDoctor = await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.doctor.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy: userId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'DELETE',
          entity: 'DOCTOR',
          entityId: id,
          details: {
            name: existingDoctor.name,
          },
        },
      });
    });

    return true;
  }
}
