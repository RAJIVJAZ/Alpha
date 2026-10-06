import { Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { badRequest, istDate } from '@foodgrid/utils';
import { MediaFolder, PresignDto } from './dto/media.dto';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
/** PDFs are only accepted for KYC documents. */
const PDF_FOLDERS: MediaFolder[] = ['kyc'];

/**
 * Issues short-lived S3 presigned PUT URLs so clients upload media directly
 * to the bucket (served via CloudFront). MinIO is used locally.
 */
@Injectable()
export class MediaService {
  private readonly bucket = process.env.S3_MEDIA_BUCKET ?? 'foodgrid-media-local';
  private readonly cdn = (process.env.CDN_BASE_URL ?? '').replace(/\/$/, '');
  private readonly s3 = new S3Client({
    region: process.env.AWS_REGION ?? 'ap-south-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  });

  async presign(userId: string, dto: PresignDto) {
    if (dto.contentType === 'application/pdf' && !PDF_FOLDERS.includes(dto.folder)) {
      throw badRequest('PDF uploads are only allowed for KYC documents', 'UNSUPPORTED_MEDIA');
    }
    const key = `${dto.folder}/${userId}/${istDate()}/${randomUUID()}.${EXT[dto.contentType]}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: dto.contentType,
      Metadata: { 'uploaded-by': userId, 'original-name': encodeURIComponent(dto.fileName) },
    });
    const expiresIn = 300;
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn });
    return {
      key,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': dto.contentType },
      publicUrl: `${this.cdn || `https://${this.bucket}.s3.amazonaws.com`}/${key}`,
      expiresIn,
      maxBytes: dto.folder === 'kyc' ? 10 * 1024 * 1024 : 5 * 1024 * 1024,
    };
  }
}
