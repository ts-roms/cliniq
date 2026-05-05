import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '@org/db';
import { randomUUID } from 'node:crypto';
import { FileCategoryDto, type PresignRequestDto, type PresignResponseDto } from './dto/presign.dto.js';
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

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    this.s3 = new S3Client({
      region: this.config.get<string>('AWS_REGION') ?? 'ap-southeast-1',
    });
    this.bucketPhi = this.config.get<string>('S3_BUCKET_PHI') ?? 'cliniq-phi-dev';
    this.bucketPublic = this.config.get<string>('S3_BUCKET_PUBLIC') ?? 'cliniq-public-dev';
  }

  /**
   * Issue a presigned PUT URL the client uses to upload directly to S3.
   * Records a PENDING file row so the upload can be confirmed and orphans
   * detected by a janitor job (out of scope here).
   */
  async presign(dto: PresignRequestDto, user: AuthenticatedUser): Promise<PresignResponseDto> {
    const isPhi = dto.isPhi ?? PHI_CATEGORIES.has(dto.category);
    const bucket = isPhi ? this.bucketPhi : this.bucketPublic;
    const ext = sanitizeExt(dto.filename);
    const key =
      `tenants/${user.tenantId}/${dto.category.toLowerCase()}/` +
      `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
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
        },
      });

      const headers: Record<string, string> = {
        'content-type': dto.mimeType,
      };
      if (isPhi) {
        headers['x-amz-server-side-encryption'] = 'aws:kms';
      }

      const uploadUrl = await getSignedUrl(
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
        await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: file.s3Key }));
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
}

function sanitizeExt(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0 || idx === filename.length - 1) return '';
  const raw = filename.slice(idx).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(raw) ? raw : '';
}
