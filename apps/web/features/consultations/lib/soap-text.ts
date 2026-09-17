import type { SoapNote } from '../schemas/consultation';

// SOAP blocks are stored as JSON (Prisma `Json?`) so we can move to rich text
// without a schema change. Anything that needs them as plain text — the editor
// textareas, the blank-check before completing a consult — flattens through
// here so the rule lives in one place.
export function soapSectionText(
  value: SoapNote[keyof SoapNote] | undefined,
): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const v = value as Record<string, unknown>;
  if (typeof v.text === 'string') return v.text;
  return JSON.stringify(value, null, 2);
}
