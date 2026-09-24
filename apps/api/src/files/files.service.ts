import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '@org/db';
import { randomUUID } from 'node:crypto';
import {
  FileCategoryDto,
  type DownloadResponseDto,
  type PresignRequestDto,
  type PresignResponseDto,
} from './dto/presign.dto.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

const PHI_CATEGORIES = new Set<FileCategoryDto>([
  FileCategoryDto.PATIENT_DOC,
  FileCategoryDto.CONSULT_ATTACHMENT,
  FileCategoryDto.CONSULT_AUDIO,
  FileCategoryDto.RX_PDF,
  FileCategoryDto.SIGNATURE,
]);

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly s3: S3Client;
  private readonly bucketPhi: string;
  private readonly bucketPublic: string;
  private readonly presignTtlSec = 300;
  /**
   * Downloads get a much shorter window than uploads. The URL is a bearer
   * credential for one PHI object: anyone holding it can fetch the file with
   * no further authentication, so it should outlive the click that produced
   * it and little else.
   */
  private readonly downloadTtlSec = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.s3 = new S3Client({
      region: this.config.get<string>('AWS_REGION') ?? 'ap-southeast-1',
    });
    this.bucketPhi =
      // `||`, not `??`: .env.example ships these as empty strings.
      this.config.get<string>('S3_BUCKET_PHI') || 'cliniq-phi-dev';
    this.bucketPublic =
      this.config.get<string>('S3_BUCKET_PUBLIC') || 'cliniq-public-dev';
  }

  /**
   * Issue a presigned PUT URL the client uses to upload directly to S3.
   * Records a PENDING file row so the upload can be confirmed and orphans
   * detected by a janitor job (out of scope here).
   */
  async presign(
    dto: PresignRequestDto,
    user: AuthenticatedUser,
  ): Promise<PresignResponseDto> {
    const isPhi = dto.isPhi ?? PHI_CATEGORIES.has(dto.category);
    const bucket = isPhi ? this.bucketPhi : this.bucketPublic;
    const ext = sanitizeExt(dto.filename);
    const key =
      `tenants/${user.tenantId}/${dto.category.toLowerCase()}/` +
      `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      // Ownership is validated inside the tenant context, so a caller cannot
      // attach their upload to a patient in another clinic: RLS makes the
      // lookup miss and this throws rather than writing an orphan link.
      if (dto.patientId) {
        const patient = await tx.patient.findFirst({
          where: { id: dto.patientId, deletedAt: null },
          select: { id: true },
        });
        if (!patient) {
          throw new BadRequestException(
            `patient ${dto.patientId} not found in this tenant`,
          );
        }
      }
      if (dto.consultationId) {
        const consult = await tx.consultation.findFirst({
          where: {
            id: dto.consultationId,
            deletedAt: null,
            ...(dto.patientId ? { patientId: dto.patientId } : {}),
          },
          select: { id: true },
        });
        if (!consult) {
          throw new BadRequestException(
            'consultation not found, or does not belong to that patient',
          );
        }
      }

      const fileRow = await tx.fileObject.create({
        data: {
          tenantId: user.tenantId,
          s3Key: key,
          filename: dto.filename,
          mimeType: dto.mimeType,
          sizeBytes: dto.sizeBytes,
          category: dto.category as never,
          isPhi,
          uploadedBy: user.userId,
          status: 'PENDING' as never,
          patientId: dto.patientId ?? null,
          consultationId: dto.consultationId ?? null,
        },
      });

      const headers: Record<string, string> = {
        'content-type': dto.mimeType,
      };
      if (isPhi) {
        headers['x-amz-server-side-encryption'] = 'aws:kms';
      }

      let uploadUrl: string;
      try {
        uploadUrl = await getSignedUrl(
          this.s3,
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: dto.mimeType,
            ContentLength: dto.sizeBytes,
            ServerSideEncryption: isPhi ? 'aws:kms' : undefined,
          }),
          { expiresIn: this.presignTtlSec },
        );
      } catch (err) {
        // Signing is local, but the SDK still needs credentials to sign
        // with. Without AWS_ACCESS_KEY_ID / a role this threw a raw
        // CredentialsProviderError -> 500; say what is actually wrong.
        if ((err as Error).name === 'CredentialsProviderError') {
          throw new ServiceUnavailableException(
            'file storage is not configured (no AWS credentials)',
          );
        }
        throw err;
      }

      this.logger.log(
        `presigned ${key} (${dto.sizeBytes}B, isPhi=${isPhi}) for user ${user.userId}`,
      );

      return {
        fileId: fileRow.id,
        s3Key: key,
        uploadUrl,
        expiresInSec: this.presignTtlSec,
        headers,
      };
    });
  }

  /**
   * Verify the file made it to S3 and flip status PENDING → READY.
   * Returns the file row so callers (e.g. consult / rx flows) can attach it.
   */
  async confirm(fileId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const file = await tx.fileObject.findFirst({
        where: { id: fileId, deletedAt: null },
      });
      if (!file) throw new NotFoundException('File not found');
      if (file.status === 'READY') return file;

      const bucket = file.isPhi ? this.bucketPhi : this.bucketPublic;
      try {
        await this.s3.send(
          new HeadObjectCommand({ Bucket: bucket, Key: file.s3Key }),
        );
      } catch (err) {
        throw new BadRequestException(
          `S3 object missing or unreadable: ${(err as Error).message}`,
        );
      }
      return tx.fileObject.update({
        where: { id: file.id },
        data: { status: 'READY' as never },
      });
    });
  }

  /**
   * Issue a short-lived presigned GET for one file.
   *
   * There was no download route at all before this, so uploaded PHI was
   * write-only through the API. Adding one without an owner column would have
   * repeated the portal BOLA of #30 with a PDF as the payload, so the
   * authorization is explicit rather than implied by tenant scope:
   *
   *   staff  — RLS scopes the lookup to their tenant, and staff may see any
   *            patient in it, so tenant scope IS the rule for them
   *   portal — must additionally own the file. `user.patientId` comes from
   *            the JWT `pid` claim, never from a param, and a file with a
   *            null patientId can never match, which makes non-clinical
   *            files staff-only by construction
   *
   * Only READY files are served: a PENDING row means the upload was never
   * confirmed, so the object may not exist or may be half-written.
   */
  async download(
    fileId: string,
    user: AuthenticatedUser,
  ): Promise<DownloadResponseDto> {
    const file = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      (tx) =>
        tx.fileObject.findFirst({ where: { id: fileId, deletedAt: null } }),
    );
    if (!file) throw new NotFoundException('File not found');

    if (user.patientId && file.patientId !== user.patientId) {
      // Deliberately the same shape as "not found": a portal caller probing
      // ids should not be able to tell an existing file from a missing one.
      throw new NotFoundException('File not found');
    }
    if (file.status !== 'READY') {
      throw new BadRequestException(
        'file upload was never confirmed; nothing to download',
      );
    }

    const bucket = file.isPhi ? this.bucketPhi : this.bucketPublic;
    let url: string;
    try {
      url = await getSignedUrl(
        this.s3,
        new GetObjectCommand({
          Bucket: bucket,
          Key: file.s3Key,
          // Force a download with the original name rather than rendering
          // in-tab, so a PDF of someone's results does not linger in a
          // shared browser's view.
          ResponseContentDisposition: `attachment; filename="${file.filename.replace(/"/g, '')}"`,
        }),
        { expiresIn: this.downloadTtlSec },
      );
    } catch (err) {
      if ((err as Error).name === 'CredentialsProviderError') {
        throw new ServiceUnavailableException(
          'file storage is not configured (no AWS credentials)',
        );
      }
      throw err;
    }

    this.logger.log(
      `download url issued for ${file.id} (isPhi=${file.isPhi}) to user ${user.userId}`,
    );
    return {
      url,
      expiresInSec: this.downloadTtlSec,
      filename: file.filename,
      mimeType: file.mimeType,
    };
  }
}

function sanitizeExt(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0 || idx === filename.length - 1) return '';
  const raw = filename.slice(idx).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(raw) ? raw : '';
}
