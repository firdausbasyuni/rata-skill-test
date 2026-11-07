import { InputType, PartialType } from '@nestjs/graphql';
import { CreateDoctorInput } from './create-doctor.input.js';

@InputType()
export class UpdateDoctorInput extends PartialType(CreateDoctorInput) {}
