import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB

@Injectable()
export class StorageService {
  private s3: S3Client;
  private bucket: string;

  constructor(private config: ConfigService) {
    this.bucket = config.getOrThrow('S3_BUCKET');
    this.s3 = new S3Client({
      region: config.get('S3_REGION') ?? 'us-east-1',
      endpoint: config.get('S3_ENDPOINT'), // set for MinIO/DigitalOcean Spaces; omit for real AWS
      forcePathStyle: !!config.get('S3_ENDPOINT'),
      credentials: {
        accessKeyId: config.getOrThrow('S3_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow('S3_SECRET_KEY'),
      },
    });
  }

  // Client uploads directly to S3 with this URL — file bytes never pass through
  // our API process, so upload size/bandwidth doesn't load the app server.
  async getUploadUrl(filename: string, mimeType: string) {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }
    const ext = filename.split('.').pop();
    const key = `products/${randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      ContentLength: MAX_UPLOAD_BYTES, // caller must not exceed this; enforce client-side too
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 }); // 5 min to use it
    return { uploadUrl, key, publicUrl: this.publicUrl(key) };
  }

  async getReadUrl(key: string, expiresIn = 3600) {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn });
  }

  private publicUrl(key: string) {
    const base = this.config.get('S3_PUBLIC_BASE_URL');
    return base ? `${base}/${key}` : key;
  }
}
