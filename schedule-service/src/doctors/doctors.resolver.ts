import { Resolver, Query, Mutation, Args, ID, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';

import { DoctorsService } from './doctors.service.js';
import { DoctorModel } from './models/doctor.model.js';
import { CreateDoctorInput } from './dto/create-doctor.input.js';
import { UpdateDoctorInput } from './dto/update-doctor.input.js';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';

interface GraphQLContext {
  req: {
    user: AuthenticatedUser;
  };
}

@Resolver(() => DoctorModel)
@UseGuards(GqlAuthGuard)
export class DoctorsResolver {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Mutation(() => DoctorModel)
  createDoctor(
    @Args('input') input: CreateDoctorInput,
    @Context() context: GraphQLContext,
  ) {
    return this.doctorsService.create(input, context.req.user.id);
  }

  @Query(() => [DoctorModel])
  doctors() {
    return this.doctorsService.findAll();
  }

  @Query(() => DoctorModel)
  doctor(@Args('id', { type: () => ID }) id: string) {
    return this.doctorsService.findOne(id);
  }

  @Mutation(() => DoctorModel)
  updateDoctor(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateDoctorInput,
    @Context() context: GraphQLContext,
  ) {
    return this.doctorsService.update(id, input, context.req.user.id);
  }

  @Mutation(() => Boolean)
  deleteDoctor(
    @Args('id', { type: () => ID }) id: string,
    @Context() context: GraphQLContext,
  ) {
    return this.doctorsService.remove(id, context.req.user.id);
  }
}
