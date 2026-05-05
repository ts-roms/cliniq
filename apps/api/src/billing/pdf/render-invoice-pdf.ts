import PDFDocument from 'pdfkit';

interface InvoicePdfData {
  invoice: {
    number: string;
    issuedAt: Date | string;
    status: string;
    notes: string | null;
    /** ISO 4217. Falls back to tenant.currency when not set on the row. */
    currency?: string;
    subtotalCentavos: number;
    discountCentavos: number;
    taxCentavos: number;
    totalCentavos: number;
    paidCentavos: number;
    items: Array<{
      description: string;
      quantity: number;
      unitPriceCentavos: number;
      totalCentavos: number;
    }>;
    payments: Array<{
      paidAt: Date | string;
      method: string;
      amountCentavos: number;
      reference: string | null;
    }>;
  };
  patient: {
    mrn: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  };
  tenant: {
    name: string;
    /** ISO 4217. Used as fallback when invoice.currency unset. Defaults PHP. */
    currency?: string;
    settings: {
      branding?: { logoUrl?: string; tagline?: string; primaryColor?: string };
      defaultInvoiceNotes?: string;
      vatPercent?: number;
    } | null;
  };
}

const formatters = new Map<string, Intl.NumberFormat>();

function moneyFmt(currency: string): Intl.NumberFormat {
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

function fmtDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Render a printable invoice PDF. Layout is intentionally plain — clinics
 * print these on plain paper or attach to HMO claim packets, so legibility
 * trumps design. Uses tenant.settings.branding for clinic name/logo when set.
 */
export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: { Title: `Invoice ${data.invoice.number}` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const currency = data.invoice.currency ?? data.tenant.currency ?? 'PHP';
    const money = (cents: number) => moneyFmt(currency).format(cents / 100);

    header(doc, data.tenant);
    invoiceMeta(doc, data.invoice);
    patientBlock(doc, data.patient);
    itemsTable(doc, data.invoice.items, money);
    totalsBlock(doc, data.invoice, money);
    if (data.invoice.payments.length > 0) paymentsBlock(doc, data.invoice.payments, money);
    notesFooter(doc, data.invoice.notes, data.tenant.settings?.defaultInvoiceNotes);

    doc.end();
  });
}

type MoneyFn = (cents: number) => string;

function header(doc: PDFKit.PDFDocument, tenant: InvoicePdfData['tenant']) {
  const accent = tenant.settings?.branding?.primaryColor ?? '#1f6feb';
  doc.fontSize(20).fillColor(accent).text(tenant.name, { continued: false });
  if (tenant.settings?.branding?.tagline) {
    doc.fontSize(9).fillColor('#666').text(tenant.settings.branding.tagline);
  }
  doc.fillColor('black').moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
  doc.strokeColor('black').moveDown(0.5);
}

function invoiceMeta(doc: PDFKit.PDFDocument, invoice: InvoicePdfData['invoice']) {
  const startY = doc.y;
  doc.fontSize(16).text('INVOICE', 50, startY);
  doc.fontSize(10).fillColor('#666');
  doc.text(`Number: ${invoice.number}`, 350, startY, { align: 'right' });
  doc.text(`Date: ${fmtDate(invoice.issuedAt)}`, 350, doc.y, { align: 'right' });
  doc.text(`Status: ${invoice.status}`, 350, doc.y, { align: 'right' });
  doc.fillColor('black').moveDown(1);
}

function patientBlock(doc: PDFKit.PDFDocument, patient: InvoicePdfData['patient']) {
  doc.fontSize(11).text('Bill to:', { continued: false });
  doc.fontSize(10).fillColor('#444');
  doc.text(`${patient.lastName}, ${patient.firstName}`);
  doc.text(`MRN: ${patient.mrn}`);
  if (patient.email) doc.text(patient.email);
  if (patient.phone) doc.text(patient.phone);
  doc.fillColor('black').moveDown(0.8);
}

function itemsTable(
  doc: PDFKit.PDFDocument,
  items: InvoicePdfData['invoice']['items'],
  money: MoneyFn,
) {
  const rowY = doc.y;
  doc.fontSize(9).fillColor('#666');
  doc.text('Description', 50, rowY, { width: 280 });
  doc.text('Qty', 340, rowY, { width: 40, align: 'right' });
  doc.text('Unit', 390, rowY, { width: 70, align: 'right' });
  doc.text('Amount', 470, rowY, { width: 75, align: 'right' });
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
  doc.strokeColor('black').moveDown(0.3);

  doc.fillColor('black').fontSize(10);
  for (const item of items) {
    const y = doc.y;
    doc.text(item.description, 50, y, { width: 280 });
    doc.text(String(item.quantity), 340, y, { width: 40, align: 'right' });
    doc.text(money(item.unitPriceCentavos), 390, y, { width: 70, align: 'right' });
    doc.text(money(item.totalCentavos), 470, y, { width: 75, align: 'right' });
    doc.moveDown(0.5);
  }
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
  doc.strokeColor('black').moveDown(0.3);
}

function totalsBlock(
  doc: PDFKit.PDFDocument,
  invoice: InvoicePdfData['invoice'],
  money: MoneyFn,
) {
  const remaining = Math.max(invoice.totalCentavos - invoice.paidCentavos, 0);
  const lines: Array<[string, string, boolean]> = [
    ['Subtotal', money(invoice.subtotalCentavos), false],
  ];
  if (invoice.discountCentavos > 0) {
    lines.push(['Discount', `−${money(invoice.discountCentavos)}`, false]);
  }
  if (invoice.taxCentavos > 0) {
    lines.push(['Tax', money(invoice.taxCentavos), false]);
  }
  lines.push(['Total', money(invoice.totalCentavos), true]);
  if (invoice.paidCentavos > 0) {
    lines.push(['Paid', money(invoice.paidCentavos), false]);
    lines.push(['Balance due', money(remaining), true]);
  }
  for (const [label, value, bold] of lines) {
    doc.fontSize(bold ? 12 : 10).fillColor(bold ? 'black' : '#444');
    const y = doc.y;
    doc.text(label, 380, y, { width: 80, align: 'right' });
    doc.text(value, 470, y, { width: 75, align: 'right' });
    doc.moveDown(0.25);
  }
  doc.fillColor('black').moveDown(1);
}

function paymentsBlock(
  doc: PDFKit.PDFDocument,
  payments: InvoicePdfData['invoice']['payments'],
  money: MoneyFn,
) {
  doc.fontSize(11).text('Payments', { continued: false });
  doc.fontSize(9).fillColor('#666');
  for (const p of payments) {
    doc.text(
      `${fmtDate(p.paidAt)} · ${p.method}${p.reference ? ` · ${p.reference}` : ''} · ${money(p.amountCentavos)}`,
    );
  }
  doc.fillColor('black').moveDown(0.5);
}

function notesFooter(
  doc: PDFKit.PDFDocument,
  invoiceNotes: string | null,
  defaultNotes: string | undefined,
) {
  const text = invoiceNotes ?? defaultNotes;
  if (!text) return;
  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
  doc.strokeColor('black').moveDown(0.3);
  doc.fontSize(9).fillColor('#666').text(text, { align: 'left' });
  doc.fillColor('black');
}
