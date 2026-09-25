import PDFDocument from 'pdfkit';
import {
  needsSupervision,
  supervisionNotice,
  type ReleasingRole,
} from '../supervision.js';
import { supersededNotice } from '../reporting.js';

export interface LabReportPdfData {
  report: {
    number: string;
    version: number;
    status: string;
    issuedAt: Date;
    /** False when a result has been corrected since this report was signed. */
    isCurrent: boolean;
    /** The report that replaced this one, when it has been superseded. */
    supersededByNumber: string | null;
    orderNumber: string;
    results: Array<{
      testCode: string | null;
      testName: string;
      resultValue: string | null;
      resultUnit: string | null;
      referenceLow: number | null;
      referenceHigh: number | null;
      abnormalFlag: string | null;
      resultStatus: string;
      /** The laboratory it was referred to, when not performed here. */
      referredTo?: string | null;
      referredToLto?: string | null;
    }>;
    signatures: Array<{
      signerName: string;
      signerRole: string;
      signerLicense: string | null;
      /**
       * The pathologist this signer acted under, where RA 5527 required one.
       * Null when the signer carried the authority themselves.
       */
      supervisorName: string | null;
      supervisorLicense: string | null;
      signedAt: Date;
    }>;
  };
  tenant: {
    name: string;
    settings?: {
      branding?: { primaryColor?: string; logoUrl?: string };
    } | null;
  };
  /**
   * The licensed laboratory. AO 2021-0037 requires the LTO number and the
   * head of laboratory on an issued report — a report that cannot name who
   * is answerable for it is not a compliant document.
   */
  laboratory?: {
    name: string;
    dohLtoNumber: string | null;
    category: string;
    classification: string | null;
    headName: string | null;
    headLicenseNumber: string | null;
    /**
     * The pathologist of record. Captured on the laboratory profile since
     * `20260924300000_lis_laboratory_licence` but never printed until now —
     * the document named who ran the laboratory and not who was answerable
     * for its results, which is what RA 5527 is about.
     */
    pathologistName: string | null;
    pathologistLicenseNumber: string | null;
    licenceExpired: boolean;
  } | null;
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
 * Render a laboratory report.
 *
 * Layout follows render-rx-pdf.ts — compact, austere, printable on plain
 * paper — because clinics handle both the same way.
 *
 * Two things here are not cosmetic:
 *
 *   1. **The signature block.** Like the PRC licence block on a prescription,
 *      a laboratory report without the name and licence of whoever released
 *      it is not a document anyone should act on.
 *   2. **The superseded banner.** A PDF is the one artifact that leaves the
 *      system and keeps existing. If someone downloads a report that a later
 *      correction invalidated, the page itself has to say so — by the time
 *      it is on paper or in an inbox, no status field can reach it.
 */
export function renderLabReportPdf(data: LabReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: { Title: `Laboratory Report ${data.report.number}` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, data.tenant, data.location);
    laboratoryBlock(doc, data.laboratory);
    supersededBanner(doc, data.report);
    reportMeta(doc, data.report);
    patientBlock(doc, data.patient);
    resultsTable(doc, data.report.results);
    referralBlock(doc, data.report.results);
    signatureBlock(doc, data.report.signatures);
    footer(doc, data.report);

    doc.end();
  });
}

function header(
  doc: PDFKit.PDFDocument,
  tenant: LabReportPdfData['tenant'],
  location: LabReportPdfData['location'],
) {
  const accent = tenant.settings?.branding?.primaryColor ?? '#1f6feb';
  doc.fontSize(16).fillColor(accent).font('Helvetica-Bold').text(tenant.name);
  doc.fillColor('#000').font('Helvetica').fontSize(9);
  if (location) {
    const line = [
      location.addressLine1,
      location.addressLine2,
      [location.city, location.province].filter(Boolean).join(', '),
    ]
      .filter(Boolean)
      .join(' · ');
    if (line) doc.text(line);
    if (location.phone) doc.text(`Tel: ${location.phone}`);
  }
  doc.moveDown(0.4);
  rule(doc);
}

/**
 * Say on the face of the page when this report is no longer the truth.
 *
 * Printed in red at the top rather than tucked in a footer: someone holding
 * this has no other way to find out.
 */
function supersededBanner(
  doc: PDFKit.PDFDocument,
  report: LabReportPdfData['report'],
) {
  const message = supersededNotice(report);
  if (message === null) return;

  doc.moveDown(0.3);
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#b00020')
    .text(message, { align: 'center' });
  doc.fillColor('#000').font('Helvetica');
  doc.moveDown(0.3);
  rule(doc);
}

/**
 * The laboratory that issued this, and under what licence.
 *
 * An expired licence is stated rather than hidden. A report issued during a
 * lapse is a fact, and a document that quietly omits it is worse than one
 * that says so plainly.
 */
function laboratoryBlock(
  doc: PDFKit.PDFDocument,
  lab: LabReportPdfData['laboratory'],
) {
  if (!lab) return;
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(9).text(lab.name, 40);
  doc.font('Helvetica').fontSize(8);

  const licence = lab.dohLtoNumber
    ? `DOH LTO No. ${lab.dohLtoNumber}`
    : 'DOH LTO number not on file';
  const cat = [lab.category, lab.classification].filter(Boolean).join(' · ');
  doc.text(cat ? `${licence}  ·  ${cat}` : licence);

  if (lab.licenceExpired) {
    doc
      .fillColor('#b00020')
      .font('Helvetica-Bold')
      .text('Licence to Operate has expired.')
      .fillColor('#000')
      .font('Helvetica');
  }
  if (lab.headName) {
    doc.text(
      lab.headLicenseNumber
        ? `Head of Laboratory: ${lab.headName} · PRC ${lab.headLicenseNumber}`
        : `Head of Laboratory: ${lab.headName}`,
    );
  }
  if (lab.pathologistName) {
    doc.text(
      lab.pathologistLicenseNumber
        ? `Pathologist of Record: ${lab.pathologistName} · PRC ${lab.pathologistLicenseNumber}`
        : `Pathologist of Record: ${lab.pathologistName}`,
    );
  }
  doc.fontSize(9);
  doc.moveDown(0.2);
  rule(doc);
}

function reportMeta(
  doc: PDFKit.PDFDocument,
  report: LabReportPdfData['report'],
) {
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(12).text('LABORATORY REPORT');
  doc.font('Helvetica').fontSize(9);
  doc.text(`Report No.: ${report.number}`);
  if (report.version > 1) {
    // A version above 1 means an earlier report was superseded. Saying so is
    // the difference between "corrected report" and "second opinion".
    doc.text(`Version: ${report.version} (supersedes an earlier report)`);
  }
  doc.text(`Order No.: ${report.orderNumber}`);
  doc.text(`Issued: ${formatDateTime(report.issuedAt)}`);
  doc.moveDown(0.4);
}

function patientBlock(
  doc: PDFKit.PDFDocument,
  patient: LabReportPdfData['patient'],
) {
  doc.font('Helvetica-Bold').fontSize(9).text('PATIENT');
  doc.font('Helvetica').fontSize(9);
  doc.text(`${patient.lastName}, ${patient.firstName}`);
  doc.text(
    `MRN: ${patient.mrn}  ·  DOB: ${formatDate(patient.dateOfBirth)}  ·  Sex: ${patient.sex}`,
  );
  doc.moveDown(0.5);
  rule(doc);
  doc.moveDown(0.3);
}

function resultsTable(
  doc: PDFKit.PDFDocument,
  results: LabReportPdfData['report']['results'],
) {
  const cols = [40, 210, 300, 370, 470];
  doc.font('Helvetica-Bold').fontSize(8);
  doc.text('TEST', cols[0], doc.y, { continued: false });
  const headerY = doc.y - 10;
  doc.text('RESULT', cols[1], headerY);
  doc.text('UNIT', cols[2], headerY);
  doc.text('REFERENCE', cols[3], headerY);
  doc.text('FLAG', cols[4], headerY);
  doc.moveDown(0.2);
  rule(doc);
  doc.moveDown(0.2);

  doc.font('Helvetica').fontSize(9);
  for (const r of results) {
    const y = doc.y;
    // A dagger rather than the laboratory's name inline: the name would not
    // fit the column, and repeating it on every row of a send-out panel
    // buries it. The block below says who each one went to.
    const name =
      (r.testCode ? `${r.testName} (${r.testCode})` : r.testName) +
      (r.referredTo ? ' †' : '');
    doc.text(name, cols[0], y, { width: cols[1] - cols[0] - 6 });
    const rowY = y;

    // Abnormal values are bolded rather than only flagged in the last
    // column: a scanning eye finds the bold number first.
    const abnormal = r.abnormalFlag !== null && r.abnormalFlag !== 'NORMAL';
    doc.font(abnormal ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(r.resultValue ?? '—', cols[1], rowY);
    doc.font('Helvetica');
    doc.text(r.resultUnit ?? '', cols[2], rowY);
    doc.text(formatReference(r.referenceLow, r.referenceHigh), cols[3], rowY);

    if (abnormal) {
      const critical = String(r.abnormalFlag).startsWith('CRITICAL');
      doc.fillColor(critical ? '#b00020' : '#a15c00').font('Helvetica-Bold');
    }
    doc.text(r.abnormalFlag ?? '', cols[4], rowY);
    doc.fillColor('#000').font('Helvetica');

    doc.moveDown(0.35);
  }
  doc.moveDown(0.3);
  rule(doc);
}

/**
 * Which tests were referred, and to which laboratory.
 *
 * AO 2021-0037 requires this on the face of the report. A referred result
 * that reads as though it were produced in-house misrepresents who is
 * answerable for it — and the destination's own LTO number is what shows
 * the referral was to a licensed laboratory.
 */
function referralBlock(
  doc: PDFKit.PDFDocument,
  results: LabReportPdfData['report']['results'],
) {
  const referred = results.filter((r) => r.referredTo);
  if (referred.length === 0) return;

  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(8).text('† REFERRED TESTS', 40);
  doc.font('Helvetica').fontSize(8);
  for (const r of referred) {
    const lto = r.referredToLto
      ? ` (DOH LTO No. ${r.referredToLto})`
      : ' (LTO number not on file)';
    doc.text(`${r.testName} — performed by ${r.referredTo}${lto}`, 40);
  }
  doc.fontSize(9);
  doc.moveDown(0.2);
  rule(doc);
}

/**
 * Who released this, and under what licence.
 *
 * Every signature is listed, not just the last: a report issued by a
 * technologist and countersigned by a pathologist carries both, and which
 * one is which is the point.
 */
function signatureBlock(
  doc: PDFKit.PDFDocument,
  signatures: LabReportPdfData['report']['signatures'],
) {
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(9).text('RELEASED BY', 40);
  doc.font('Helvetica').fontSize(9);

  if (signatures.length === 0) {
    // Should not occur — issuing creates a signature — but a report that
    // somehow has none must not look signed.
    doc.fillColor('#b00020').text('No signature on record.').fillColor('#000');
    return;
  }

  for (const sig of signatures) {
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').text(sig.signerName, 40);
    doc.font('Helvetica').fontSize(8);
    const role = sig.signerRole.replace(/_/g, ' ').toLowerCase();
    doc.text(
      sig.signerLicense
        ? `${role} · PRC Licence No. ${sig.signerLicense}`
        : `${role} · licence not on file`,
    );
    // Who the signer answered to. The wording comes from
    // ./supervision.ts rather than being assembled here, because pdfkit
    // compresses its streams and a test cannot read text back out of a
    // generated PDF — the same reason `supersededNotice()` was extracted.
    const notice = supervisionNotice(
      sig.supervisorName
        ? {
            kind: 'SUPERVISED',
            supervisorName: sig.supervisorName,
            supervisorLicense: sig.supervisorLicense,
          }
        : needsSupervision(sig.signerRole as ReleasingRole)
          ? { kind: 'UNSUPERVISED' }
          : { kind: 'SELF' },
    );
    if (notice) {
      // An unsupervised release is stated in red, the same decision as an
      // expired Licence to Operate. A document that quietly omits it reads
      // as compliance.
      if (sig.supervisorName) doc.text(notice);
      else doc.fillColor('#b00020').text(notice).fillColor('#000');
    }
    doc.text(`Signed ${formatDateTime(sig.signedAt)}`);
    doc.fontSize(9);
  }
}

function footer(doc: PDFKit.PDFDocument, report: LabReportPdfData['report']) {
  doc.moveDown(1);
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor('#666')
    .text(
      `${report.number} · generated ${formatDateTime(new Date())}. Results relate only to the specimen(s) tested.`,
      40,
      doc.y,
      { align: 'center' },
    );
  doc.fillColor('#000');
}

function rule(doc: PDFKit.PDFDocument) {
  doc
    .strokeColor('#999')
    .lineWidth(0.5)
    .moveTo(40, doc.y)
    .lineTo(555, doc.y)
    .stroke();
}

/** "3.5 – 5.1", "< 5.1", "> 3.5", or blank when no interval is recorded. */
function formatReference(low: number | null, high: number | null): string {
  if (low !== null && high !== null) return `${low} – ${high}`;
  if (high !== null) return `< ${high}`;
  if (low !== null) return `> ${low}`;
  return '';
}

function formatDate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

function formatDateTime(d: Date): string {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}
