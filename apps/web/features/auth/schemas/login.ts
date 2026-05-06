import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  // Login validates an existing password against its hash — the password
  // policy belongs on signup, not here. Don't leak the rule on login.
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
