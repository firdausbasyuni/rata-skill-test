import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateScheduleInput } from './dto/create-schedule.input.js';
import { UpdateScheduleInput } from './dto/update-schedule.input.js';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateScheduleInput, userId: string) {
    const scheduledAt = new Date(input.scheduledAt);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled date');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findFirst({
          where: {
            id: input.customerId,
            deletedAt: null,
          },
        });

        if (!customer) {
          throw new NotFoundException('Active customer not found');
        }

        const doctor = await tx.doctor.findFirst({
          where: {
            id: input.doctorId,
            deletedAt: null,
          },
        });

        if (!doctor) {
          throw new NotFoundException('Active doctor not found');
        }

        const schedule = await tx.schedule.create({
          data: {
            objective: input.objective,
            customerId: input.customerId,
            doctorId: input.doctorId,
            scheduledAt,
          },
          include: {
            customer: true,
            doctor: true,
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'CREATE',
            entity: 'SCHEDULE',
            entityId: schedule.id,
            details: {
              after: {
                objective: schedule.objective,
                customerId: schedule.customerId,
                doctorId: schedule.doctorId,
                scheduledAt: schedule.scheduledAt.toISOString(),
              },
            },
          },
        });

        return schedule;
      });
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async findAll(
    skip = 0,
    take = 20,
    filters?: {
      customerId?: string;
      doctorId?: string;
      from?: string;
      to?: string;
    },
  ) {
    if (skip < 0 || take < 1 || take > 100) {
      throw new BadRequestException(
        'skip must be >= 0 and take must be between 1 and 100',
      );
    }

    const from = filters?.from ? new Date(filters.from) : undefined;
    const to = filters?.to ? new Date(filters.to) : undefined;

    if (from && to && from > to) {
      throw new BadRequestException(
        'The start date must not be later than the end date',
      );
    }

    const where: Prisma.ScheduleWhereInput = {
      deletedAt: null,
      ...(filters?.customerId && { customerId: filters.customerId }),
      ...(filters?.doctorId && { doctorId: filters.doctorId }),
      ...(from || to
        ? {
            scheduledAt: {
              ...(from && { gte: from }),
              ...(to && { lte: to }),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.schedule.findMany({
        where,
        skip,
        take,
        orderBy: {
          scheduledAt: 'asc',
        },
        include: {
          customer: true,
          doctor: true,
        },
      }),
      this.prisma.schedule.count({ where }),
    ]);

    return {
      items,
      total,
      skip,
      take,
    };
  }

  async findOne(id: string) {
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        customer: true,
        doctor: true,
      },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    return schedule;
  }

  async update(id: string, input: UpdateScheduleInput, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.schedule.findFirst({
          where: {
            id,
            deletedAt: null,
          },
          include: {
            customer: true,
            doctor: true,
          },
        });

        if (!existing) {
          throw new NotFoundException('Schedule not found');
        }

        if (input.customerId !== undefined) {
          const customer = await tx.customer.findFirst({
            where: {
              id: input.customerId,
              deletedAt: null,
            },
          });

          if (!customer) {
            throw new NotFoundException('Active customer not found');
          }
        }

        if (input.doctorId !== undefined) {
          const doctor = await tx.doctor.findFirst({
            where: {
              id: input.doctorId,
              deletedAt: null,
            },
          });

          if (!doctor) {
            throw new NotFoundException('Active doctor not found');
          }
        }

        const scheduledAt =
          input.scheduledAt !== undefined
            ? new Date(input.scheduledAt)
            : existing.scheduledAt;

        if (Number.isNaN(scheduledAt.getTime())) {
          throw new BadRequestException('Invalid scheduled date');
        }

        const schedule = await tx.schedule.update({
          where: { id },
          data: {
            ...(input.objective !== undefined && {
              objective: input.objective,
            }),
            ...(input.customerId !== undefined && {
              customerId: input.customerId,
            }),
            ...(input.doctorId !== undefined && {
              doctorId: input.doctorId,
            }),
            ...(input.scheduledAt !== undefined && {
              scheduledAt,
            }),
          },
          include: {
            customer: true,
            doctor: true,
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'UPDATE',
            entity: 'SCHEDULE',
            entityId: schedule.id,
            details: {
              before: {
                objective: existing.objective,
                customerId: existing.customerId,
                doctorId: existing.doctorId,
                scheduledAt: existing.scheduledAt.toISOString(),
              },
              after: {
                objective: schedule.objective,
                customerId: schedule.customerId,
                doctorId: schedule.doctorId,
                scheduledAt: schedule.scheduledAt.toISOString(),
              },
            },
          },
        });

        return schedule;
      });
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async remove(id: string, userId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.schedule.findFirst({
        where: {
          id,
          deletedAt: null,
        },
      });

      if (!existing) {
        throw new NotFoundException('Schedule not found');
      }

      await tx.schedule.update({
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
          entity: 'SCHEDULE',
          entityId: id,
          details: {
            before: {
              objective: existing.objective,
              customerId: existing.customerId,
              doctorId: existing.doctorId,
              scheduledAt: existing.scheduledAt.toISOString(),
            },
          },
        },
      });

      return true;
    });
  }

  private handleDatabaseError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Doctor already has a schedule at this time');
    }

    throw error;
  }
}
