import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCustomerInput } from './dto/create-customer.input.js';
import { UpdateCustomerInput } from './dto/update-customer.input.js';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCustomerInput, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            name: input.name,
            email: input.email.toLowerCase().trim(),
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'CREATE',
            entity: 'CUSTOMER',
            entityId: customer.id,
            details: {
              name: customer.name,
              email: customer.email,
            },
          },
        });

        return customer;
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Customer email already exists');
      }

      throw error;
    }
  }

  async findAll() {
    return this.prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async update(id: string, input: UpdateCustomerInput, userId: string) {
    const existingCustomer = await this.findOne(id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.update({
          where: { id },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.email !== undefined && {
              email: input.email.toLowerCase().trim(),
            }),
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'UPDATE',
            entity: 'CUSTOMER',
            entityId: customer.id,
            details: {
              before: {
                name: existingCustomer.name,
                email: existingCustomer.email,
              },
              after: {
                name: customer.name,
                email: customer.email,
              },
            },
          },
        });

        return customer;
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Customer email already exists');
      }

      throw error;
    }
  }

  async remove(id: string, userId: string) {
    const existingCustomer = await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
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
          entity: 'CUSTOMER',
          entityId: id,
          details: {
            name: existingCustomer.name,
            email: existingCustomer.email,
          },
        },
      });
    });

    return true;
  }
}
