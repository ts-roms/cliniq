import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'at least 8 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;
