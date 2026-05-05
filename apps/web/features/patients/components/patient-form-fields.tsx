'use client';

import type { UseFormRegister, FieldErrors } from 'react-hook-form';
import { Input, Select } from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import type { CreatePatientInput } from '../schemas/patient';

interface Props {
  register: UseFormRegister<CreatePatientInput>;
  errors: FieldErrors<CreatePatientInput>;
}

/**
 * Shared form body — used by both Create and Edit dialogs. Keeps validation
 * + UI in one place so a field added here lights up both flows.
 */
export function PatientFormFields({ register, errors }: Props) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="MRN" error={errors.mrn?.message}>
          <Input placeholder="MRN-001" {...register('mrn')} />
        </FormField>
        <FormField label="Sex" error={errors.sex?.message}>
          <Select {...register('sex')}>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
            <option value="UNDISCLOSED">Undisclosed</option>
          </Select>
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="First name" error={errors.firstName?.message}>
          <Input {...register('firstName')} />
        </FormField>
        <FormField label="Last name" error={errors.lastName?.message}>
          <Input {...register('lastName')} />
        </FormField>
      </div>
      <FormField label="Date of birth" error={errors.dateOfBirth?.message}>
        <Input type="date" {...register('dateOfBirth')} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Email" error={errors.email?.message}>
          <Input type="email" {...register('email')} />
        </FormField>
        <FormField label="Phone" error={errors.phone?.message}>
          <Input {...register('phone')} placeholder="0917-555-0100" />
        </FormField>
      </div>
    </>
  );
}
