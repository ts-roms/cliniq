// Mirror of apps/web/features/billing/components/money.ts so mobile shares
// the same currency-formatting contract. Kept duplicated rather than shared
// because mobile and web have different lib import paths in this workspace.

const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  let f = formatters.get(currency);
  if (!f) {
    const locale = currency === 'PHP' ? 'en-PH' : undefined;
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    });
    formatters.set(currency, f);
  }
  return f;
}

export function formatCentavos(cents: number, currency = 'PHP'): string {
  return getFormatter(currency).format(cents / 100);
}
