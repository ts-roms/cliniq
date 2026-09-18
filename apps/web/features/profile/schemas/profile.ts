import { z } from 'zod';

/** What GET /api/me/staff-profile returns. */
export interface StaffProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  prcLicenseNumber: string | null;
  prcLicenseExpiry: string | null;
  prcSpecialty: string | null;
}

export const staffProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  // Digits only; the api enforces the same pattern. Blank = clear.
  prcLicenseNumber: z
    .string()
    .trim()
    .regex(/^(\d{4,10})?$/, 'PRC licence number is 4–10 digits'),
  // <input type="date"> gives YYYY-MM-DD or ''.
  prcLicenseExpiry: z.string().trim(),
  prcSpecialty: z.string().trim().max(120),
});

export type StaffProfileInput = z.input<typeof staffProfileSchema>;
export type StaffProfileOutput = z.output<typeof staffProfileSchema>;
