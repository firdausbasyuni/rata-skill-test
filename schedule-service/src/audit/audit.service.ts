import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateAuditLogInput {
  userId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: 'CUSTOMER' | 'DOCTOR' | 'SCHEDULE';
  entityId: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: CreateAuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        details: input.details
          ? JSON.parse(JSON.stringify(input.details))
          : undefined,
      },
    });
  }

  async findAll(skip = 0, take = 20) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count(),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        details: item.details ? JSON.stringify(item.details) : null,
      })),
      total,
      skip,
      take,
    };
  }

  async findByEntity(entity: string, entityId: string, skip = 0, take = 20) {
    const where = { entity, entityId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        details: item.details ? JSON.stringify(item.details) : null,
      })),
      total,
      skip,
      take,
    };
  }

  async findByUser(userId: string, skip = 0, take = 20) {
    const where = { userId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        details: item.details ? JSON.stringify(item.details) : null,
      })),
      total,
      skip,
      take,
    };
  }
}
