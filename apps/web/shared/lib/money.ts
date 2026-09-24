import { z } from 'zod';

// Staff enter money in pesos (e.g. "1500.50"); the API stores integer
// centavos. These helpers are the one place that conversion happens.
// Rounding absorbs float noise such as 0.1 * 100 = 10.000000000000002.

export function pesosToCentavos(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centavosToPesos(centavos: number): number {
  return centavos / 100;
}

/**
 * Zod field whose form input is pesos and whose parsed output is centavos.
 * `min` is in pesos — pass 0.01 for amounts that must be positive.
 */
export function pesosAsCentavos({ min = 0 }: { min?: number } = {}) {
  return z.coerce
    .number()
    .min(min, min > 0 ? 'must be greater than 0' : 'cannot be negative')
    .refine(
      (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6,
      'at most 2 decimal places',
    )
    .transform((v) => Math.round(v * 100));
}

/** Props for an <Input> that takes a peso amount. */
export const pesoInputProps = {
  type: 'number',
  step: '0.01',
  min: 0,
  inputMode: 'decimal',
  placeholder: '0.00',
} as const;
