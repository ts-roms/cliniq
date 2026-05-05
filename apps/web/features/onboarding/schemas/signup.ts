import { z } from 'zod';

export const clinicStepSchema = z.object({
  clinicName: z.string().min(2, 'clinic name required').max(120),
  slug: z
    .string()
    .min(3, 'at least 3 characters')
    .max(40)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'lowercase letters, digits, and hyphens'),
});

export const ownerStepSchema = z
  .object({
    ownerName: z.string().min(2).max(120),
    ownerEmail: z.string().email(),
    password: z.string().min(8, 'at least 8 characters'),
    confirmPassword: z.string().min(8),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'passwords do not match',
    path: ['confirmPassword'],
  });

export type ClinicStepInput = z.infer<typeof clinicStepSchema>;
export type OwnerStepInput = z.infer<typeof ownerStepSchema>;

export const signupInputSchema = clinicStepSchema.merge(
  z.object({
    ownerName: z.string().min(2).max(120),
    ownerEmail: z.string().email(),
    password: z.string().min(8),
  }),
);

export type SignupInput = z.infer<typeof signupInputSchema>;
