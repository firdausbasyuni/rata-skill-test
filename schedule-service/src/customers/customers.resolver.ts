import { Resolver, Query, Mutation, Args, ID, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';

import { CustomersService } from './customers.service.js';
import { CustomerModel } from './models/customer.model.js';
import { CreateCustomerInput } from './dto/create-customer.input.js';
import { UpdateCustomerInput } from './dto/update-customer.input.js';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard.js';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';

interface GraphQLContext {
  req: {
    user: AuthenticatedUser;
  };
}

@Resolver(() => CustomerModel)
@UseGuards(GqlAuthGuard)
export class CustomersResolver {
  constructor(private readonly customersService: CustomersService) {}

  @Mutation(() => CustomerModel)
  createCustomer(
    @Args('input') input: CreateCustomerInput,
    @Context() context: GraphQLContext,
  ) {
    return this.customersService.create(input, context.req.user.id);
  }

  @Query(() => [CustomerModel])
  customers() {
    return this.customersService.findAll();
  }

  @Query(() => CustomerModel)
  customer(@Args('id', { type: () => ID }) id: string) {
    return this.customersService.findOne(id);
  }

  @Mutation(() => CustomerModel)
  updateCustomer(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateCustomerInput,
    @Context() context: GraphQLContext,
  ) {
    return this.customersService.update(id, input, context.req.user.id);
  }

  @Mutation(() => Boolean)
  deleteCustomer(
    @Args('id', { type: () => ID }) id: string,
    @Context() context: GraphQLContext,
  ) {
    return this.customersService.remove(id, context.req.user.id);
  }
}
