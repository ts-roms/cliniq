// Cache formatters per currency code — Intl.NumberFormat is non-trivial to
// construct and we render lots of rows. Defaults to PHP since this is a
// PH-first product; pass invoice.currency / tenant.currency to override.
const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  let f = formatters.get(currency);
  if (!f) {
    // Locale chosen so Intl picks a reasonable symbol grouping for the
    // currency — `en-PH` for PHP, otherwise let Intl pick the locale default.
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
