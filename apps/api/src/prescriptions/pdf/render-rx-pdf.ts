import PDFDocument from 'pdfkit';

export interface RxPdfData {
  rx: {
    number: string;
    issuedAt: Date;
    validUntil: Date | null;
    notes: string | null;
    providerName: string | null;
    providerLicense: string | null;
    providerSpecialty: string | null;
    items: Array<{
      drugName: string;
      strength: string | null;
      form: string | null;
      dose: string;
      frequency: string;
      durationDays: number | null;
      quantity: string | null;
      instructions: string | null;
      refills: number;
    }>;
  };
  tenant: {
    name: string;
    settings?: { branding?: { primaryColor?: string; logoUrl?: string } } | null;
  };
  location?: {
    name: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    province: string | null;
    phone: string | null;
  } | null;
  patient: {
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    sex: string;
    mrn: string;
  };
}

/**
 * Render a printable e-prescription. Layout is intentionally compact and
 * austere — clinics print on plain paper or send via portal/email. The PRC
 * license number block at the bottom is non-negotiable; without it the Rx
 * is not legally valid in PH.
 */
export function renderRxPdf(data: RxPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A5',
      margin: 36,
      info: { Title: `Prescription ${data.rx.number}` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, data.tenant, data.location);
    rxMeta(doc, data.rx);
    patientBlock(doc, data.patient);
    itemsBlock(doc, data.rx.items);
    if (data.rx.notes) notes(doc, data.rx.notes);
    providerBlock(doc, data.rx);

    doc.end();
  });
}

function header(
  doc: PDFKit.PDFDocument,
  tenant: RxPdfData['tenant'],
  location: RxPdfData['location'],
) {
  const accent = tenant.settings?.branding?.primaryColor ?? '#1f6feb';
  doc.fontSize(16).fillColor(accent).font('Helvetica-Bold').text(tenant.name);
  doc.fillColor('#000').font('Helvetica').fontSize(9);
  if (location) {
    const line = [
      location.addressLine1,
      location.addressLine2,
      [location.city, location.province].filter(Boolean).join(', '),
    ].filter(Boolean).join(' · ');
    if (line) doc.text(line);
    if (location.phone) doc.text(`Tel: ${location.phone}`);
  }
  doc.moveDown(0.4);
  doc
    .strokeColor('#999')
    .lineWidth(0.5)
    .moveTo(36, doc.y)
    .lineTo(420, doc.y)
    .stroke();
  doc.moveDown(0.5);
}

function rxMeta(doc: PDFKit.PDFDocument, rx: RxPdfData['rx']) {
  doc.font('Helvetica-Bold').fontSize(11).text('PRESCRIPTION');
  doc.font('Helvetica').fontSize(9);
  doc.text(`Rx No.: ${rx.number}`);
  doc.text(`Date issued: ${formatDate(rx.issuedAt)}`);
  if (rx.validUntil) doc.text(`Valid until: ${formatDate(rx.validUntil)}`);
  doc.moveDown(0.5);
}

function patientBlock(doc: PDFKit.PDFDocument, p: RxPdfData['patient']) {
  doc.font('Helvetica-Bold').fontSize(10).text('Patient');
  doc.font('Helvetica').fontSize(9);
  doc.text(`${p.lastName}, ${p.firstName}`);
  const age = ageFromDob(p.dateOfBirth);
  doc.text(`MRN ${p.mrn}  ·  ${p.sex}  ·  ${age} y.o.  (DOB ${formatDate(p.dateOfBirth)})`);
  doc.moveDown(0.5);
}

function itemsBlock(doc: PDFKit.PDFDocument, items: RxPdfData['rx']['items']) {
  doc.font('Helvetica-Bold').fontSize(11).text('℞');
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(10);

  items.forEach((it, idx) => {
    const head =
      `${idx + 1}. ${it.drugName}` +
      (it.strength ? `  ${it.strength}` : '') +
      (it.form ? `  ${it.form.toLowerCase()}` : '');
    doc.font('Helvetica-Bold').text(head);

    const sigParts = [
      `Sig: ${it.dose}`,
      it.frequency,
      it.durationDays ? `× ${it.durationDays} day(s)` : null,
    ].filter(Boolean) as string[];
    doc.font('Helvetica').text(sigParts.join('  '));

    const tail: string[] = [];
    if (it.quantity) tail.push(`Disp: ${it.quantity}`);
    if (it.refills > 0) tail.push(`Refills: ${it.refills}`);
    if (tail.length) doc.fontSize(9).fillColor('#444').text(tail.join('  ·  ')).fillColor('#000').fontSize(10);

    if (it.instructions) {
      doc.fontSize(9).fillColor('#444').text(`  ${it.instructions}`).fillColor('#000').fontSize(10);
    }
    doc.moveDown(0.3);
  });
  doc.moveDown(0.3);
}

function notes(doc: PDFKit.PDFDocument, n: string) {
  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#444').text(n);
  doc.fillColor('#000').font('Helvetica');
  doc.moveDown(0.3);
}

function providerBlock(doc: PDFKit.PDFDocument, rx: RxPdfData['rx']) {
  // Pin the provider block near the bottom for signature legibility.
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y < pageBottom - 80) doc.y = pageBottom - 80;

  doc.strokeColor('#999').lineWidth(0.5).moveTo(36, doc.y).lineTo(420, doc.y).stroke();
  doc.moveDown(0.4);

  doc.font('Helvetica-Bold').fontSize(10).text(rx.providerName ?? '—');
  doc.font('Helvetica').fontSize(9);
  if (rx.providerSpecialty) doc.text(rx.providerSpecialty);
  doc.text(`PRC License No.: ${rx.providerLicense ?? '—'}`);
  doc.fontSize(8).fillColor('#666').text(
    'Electronic prescription — generated and signed via ClinIQ. Verify authenticity at the issuing clinic.',
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
}

function ageFromDob(dob: Date): number {
  const ageMs = Date.now() - dob.getTime();
  return Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
}
