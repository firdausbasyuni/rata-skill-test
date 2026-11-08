import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Prisma } from '@prisma/client';
import { validate as isValidUUID } from 'uuid';

import { PrismaService } from '../prisma/prisma.service.js';
import { CacheService } from '../cache/cache.service.js';
import { CreateScheduleInput } from './dto/create-schedule.input.js';
import { UpdateScheduleInput } from './dto/update-schedule.input.js';

interface ScheduleFilters {
  customerId?: string;
  doctorId?: string;
  from?: string;
  to?: string;
}

export interface ScheduleListResult {
  items: unknown[];
  total: number;
  skip: number;
  take: number;
}

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);
  private readonly scheduleCacheTtl = 30;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('email')
    private readonly emailQueue: Queue,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Validate UUID input before passing it to Prisma.
   */
  private validateUUID(value: string, fieldName: string): void {
    if (!isValidUUID(value)) {
      throw new BadRequestException(`${fieldName} must be a valid UUID`);
    }
  }

  /**
   * Create a schedule and enqueue an appointment notification.
   */
  async create(input: CreateScheduleInput, userId: string) {
    this.validateUUID(input.customerId, 'customerId');
    this.validateUUID(input.doctorId, 'doctorId');
    this.validateUUID(userId, 'userId');

    const scheduledAt = new Date(input.scheduledAt);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled date');
    }

    try {
      const schedule = await this.prisma.$transaction(async (tx) => {
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

        const createdSchedule = await tx.schedule.create({
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
            entityId: createdSchedule.id,
            details: {
              after: {
                objective: createdSchedule.objective,
                customerId: createdSchedule.customerId,
                doctorId: createdSchedule.doctorId,
                scheduledAt: createdSchedule.scheduledAt.toISOString(),
              },
            },
          },
        });

        return createdSchedule;
      });

      // Invalidate cached schedule lists after the transaction commits.
      await this.cacheService.invalidateSchedules();

      // Enqueue notification only after the transaction commits.
      try {
        await this.emailQueue.add('send', {
          to: schedule.customer.email,
          subject: 'Your appointment has been scheduled',
          text: [
            `Hello ${schedule.customer.name},`,
            '',
            'Your appointment has been successfully scheduled.',
            '',
            `Objective: ${schedule.objective}`,
            `Doctor: ${schedule.doctor.name}`,
            `Date: ${schedule.scheduledAt.toISOString()}`,
            '',
            'Thank you.',
          ].join('\n'),
          html: `
            <h2>Appointment Confirmation</h2>
            <p>Hello ${schedule.customer.name},</p>
            <p>Your appointment has been successfully scheduled.</p>
            <ul>
              <li><strong>Objective:</strong> ${schedule.objective}</li>
              <li><strong>Doctor:</strong> ${schedule.doctor.name}</li>
              <li><strong>Date:</strong> ${schedule.scheduledAt.toISOString()}</li>
            </ul>
            <p>Thank you.</p>
          `,
        });
      } catch (error) {
        // Do not fail schedule creation if the queue is temporarily unavailable.
        this.logger.error(
          `Failed to enqueue appointment email for schedule ${schedule.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }

      return schedule;
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Retrieve schedules with pagination and optional filters.
   */
  async findAll(
    skip = 0,
    take = 20,
    filters?: ScheduleFilters,
  ): Promise<ScheduleListResult> {
    if (
      !Number.isInteger(skip) ||
      !Number.isInteger(take) ||
      skip < 0 ||
      take < 1 ||
      take > 100
    ) {
      throw new BadRequestException(
        'skip must be >= 0 and take must be between 1 and 100',
      );
    }

    // Validate UUID filters before querying Prisma.
    if (filters?.customerId) {
      this.validateUUID(filters.customerId, 'customerId');
    }

    if (filters?.doctorId) {
      this.validateUUID(filters.doctorId, 'doctorId');
    }

    const from = filters?.from ? new Date(filters.from) : undefined;
    const to = filters?.to ? new Date(filters.to) : undefined;

    if (from && Number.isNaN(from.getTime())) {
      throw new BadRequestException('Invalid start date');
    }

    if (to && Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid end date');
    }

    if (from && to && from > to) {
      throw new BadRequestException(
        'The start date must not be later than the end date',
      );
    }

    const where: Prisma.ScheduleWhereInput = {
      deletedAt: null,
      ...(filters?.customerId && {
        customerId: filters.customerId,
      }),
      ...(filters?.doctorId && {
        doctorId: filters.doctorId,
      }),
      ...(from || to
        ? {
            scheduledAt: {
              ...(from && { gte: from }),
              ...(to && { lte: to }),
            },
          }
        : {}),
    };

    // Include pagination and filters in the cache key.
    const cacheVersion = await this.cacheService.getScheduleCacheVersion();

    const cacheKey = `schedules:v${cacheVersion}:${JSON.stringify({
      skip,
      take,
      customerId: filters?.customerId ?? null,
      doctorId: filters?.doctorId ?? null,
      from: filters?.from ?? null,
      to: filters?.to ?? null,
    })}`;

    // Return cached data when available.
    const cached = await this.cacheService.get<ScheduleListResult>(cacheKey);

    if (cached !== null) {
      this.logger.debug(`Schedule cache hit: ${cacheKey}`);
      return cached;
    }

    this.logger.debug(`Schedule cache miss: ${cacheKey}`);

    // Fetch from PostgreSQL on a cache miss.
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

    const result: ScheduleListResult = {
      items,
      total,
      skip,
      take,
    };

    // Cache the result for 30 seconds.
    await this.cacheService.set(cacheKey, result, this.scheduleCacheTtl);

    return result;
  }

  /**
   * Retrieve one active schedule by ID.
   */
  async findOne(id: string) {
    this.validateUUID(id, 'id');

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

  /**
   * Update an existing schedule.
   */
  async update(id: string, input: UpdateScheduleInput, userId: string) {
    this.validateUUID(id, 'id');
    this.validateUUID(userId, 'userId');

    if (input.customerId !== undefined) {
      this.validateUUID(input.customerId, 'customerId');
    }

    if (input.doctorId !== undefined) {
      this.validateUUID(input.doctorId, 'doctorId');
    }

    try {
      const updatedSchedule = await this.prisma.$transaction(async (tx) => {
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

      // Invalidate only after a successful database transaction.
      await this.cacheService.invalidateSchedules();

      return updatedSchedule;
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Soft-delete a schedule.
   */
  async remove(id: string, userId: string): Promise<boolean> {
    this.validateUUID(id, 'id');
    this.validateUUID(userId, 'userId');

    const result = await this.prisma.$transaction(async (tx) => {
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

    // Invalidate only after a successful database transaction.
    await this.cacheService.invalidateSchedules();

    return result;
  }

  /**
   * Translate known Prisma errors into appropriate HTTP exceptions.
   */
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
