import { InputType, PartialType } from '@nestjs/graphql';
import { CreateCustomerInput } from './create-customer.input.js';

@InputType()
export class UpdateCustomerInput extends PartialType(CreateCustomerInput) {}
