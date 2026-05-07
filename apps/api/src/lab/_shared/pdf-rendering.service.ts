import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';

/**
 * Shared PDF generation + S3 storage for the lab module. Two callers today:
 *   • LabInvoicesService — invoice PDFs.
 *   • LabComplianceService — conformity declarations on shipment.
 *
 * Renders straight to a Buffer with pdfkit (no headless browser), uploads to
 * the PHI bucket under a path the caller chooses, and returns a presigned
 * GET URL the web app can hand to <a download>.
 */
@Injectable()
export class LabPdfRenderingService {
  private readonly logger = new Logger(LabPdfRenderingService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly downloadTtlSec = 600;

  constructor(private readonly config: ConfigService) {
    this.s3 = new S3Client({
      region: this.config.get<string>('AWS_REGION') ?? 'ap-southeast-1',
    });
    this.bucket = this.config.get<string>('S3_BUCKET_PHI') ?? 'cliniq-phi-dev';
  }

  /**
   * Build a Buffer from a pdfkit-script callback, upload to S3, return key.
   * The caller persists the key on its own model (`pdfFileKey`).
   */
  async renderToS3(
    keyPrefix: string,
    filename: string,
    draw: (doc: PDFKit.PDFDocument) => void,
  ): Promise<{ s3Key: string; filename: string }> {
    const buffer = await this.draw(draw);
    const s3Key = `${keyPrefix.replace(/\/+$/u, '')}/${randomUUID()}-${sanitizeName(filename)}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: 'application/pdf',
        ServerSideEncryption: 'aws:kms',
      }),
    );
    this.logger.log(`uploaded PDF ${s3Key} (${buffer.byteLength}B)`);
    return { s3Key, filename };
  }

  /** Issue a short-TTL presigned GET URL for a stored key. */
  async presignDownload(s3Key: string, downloadFilename: string): Promise<{
    url: string;
    expiresInSec: number;
    filename: string;
  }> {
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        ResponseContentDisposition: `attachment; filename="${sanitizeName(downloadFilename)}"`,
      }),
      { expiresIn: this.downloadTtlSec },
    );
    return { url, expiresInSec: this.downloadTtlSec, filename: downloadFilename };
  }

  // ── Reusable building blocks ─────────────────────────────

  /** Standard letterhead: lab name, type label, document ref. */
  drawLetterhead(
    doc: PDFKit.PDFDocument,
    opts: { labName: string; labKindLabel?: string; docTitle: string; docRef?: string },
  ): void {
    doc.font('Helvetica-Bold').fontSize(20).text(opts.labName, { continued: false });
    if (opts.labKindLabel) {
      doc.font('Helvetica').fontSize(10).fillColor('#666')
        .text(opts.labKindLabel)
        .fillColor('black');
    }
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(16).text(opts.docTitle);
    if (opts.docRef) {
      doc.font('Helvetica').fontSize(10).fillColor('#666').text(opts.docRef).fillColor('black');
    }
    doc.moveDown(1);
    doc.strokeColor('#ccc').moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke().strokeColor('black');
    doc.moveDown(0.7);
  }

  /** Two-column "label: value" block — handy for header metadata. */
  drawKeyValueGrid(
    doc: PDFKit.PDFDocument,
    rows: Array<{ label: string; value: string }>,
    columns = 2,
  ): void {
    if (rows.length === 0) return;
    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colW = usable / columns;
    const startX = doc.page.margins.left;
    let row = 0;
    while (row < rows.length) {
      const yStart = doc.y;
      let yMax = yStart;
      for (let c = 0; c < columns; c += 1) {
        const r = rows[row + c];
        if (!r) continue;
        const x = startX + c * colW;
        doc.font('Helvetica').fontSize(8).fillColor('#666')
          .text(r.label.toUpperCase(), x, yStart, { width: colW - 12, lineGap: 1 });
        doc.font('Helvetica').fontSize(11).fillColor('black')
          .text(r.value, x, doc.y, { width: colW - 12 });
        yMax = Math.max(yMax, doc.y);
      }
      doc.y = yMax;
      doc.moveDown(0.4);
      row += columns;
    }
    doc.moveDown(0.5);
  }

  /** Simple two-tone footer with a generation timestamp. */
  drawFooter(doc: PDFKit.PDFDocument, note?: string): void {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const bottom = doc.page.height - doc.page.margins.bottom + 12;
      doc.font('Helvetica').fontSize(8).fillColor('#999')
        .text(
          `${note ?? 'Generated by ClinIQ Lab'} · ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC · page ${i + 1} of ${range.count}`,
          doc.page.margins.left,
          bottom,
          {
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
            align: 'center',
            lineBreak: false,
          },
        )
        .fillColor('black');
    }
  }

  // ── Internals ────────────────────────────────────────────

  private draw(fn: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        bufferPages: true,
        info: { Producer: 'ClinIQ Lab', Creator: 'ClinIQ Lab' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      try {
        fn(doc);
        doc.end();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }
}

function sanitizeName(name: string): string {
  // Keep alphanumerics, dot, dash, underscore. Replace anything else with `_`
  // to make the name safe for both S3 keys and Content-Disposition.
  return name.replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 200);
}

/**
 * Substitute `{{key}}` placeholders in a template body. Unknown keys are left
 * intact so authors notice typos. Used by conformity + consent rendering.
 */
export function applyTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/gu, (m, key) => vars[key] ?? m);
}
