/**
 * Whether `url` is a file this user uploaded to `folder` through user-service
 * POST /media/presign, whose keys are <folder>/<userId>/<yyyy-mm-dd>/<uuid>.<ext>
 * under the same public base (CDN_BASE_URL, else the bucket URL). PDFs are only
 * presigned for KYC documents.
 * shortcut: checks the key, not that the object exists; HEAD it if a photo ever
 * becomes proof on its own.
 */
export function isOwnUpload(
  url: string,
  userId: string,
  folder: 'delivery-proof' | 'kyc',
): boolean {
  const base =
    process.env.CDN_BASE_URL ||
    `https://${process.env.S3_MEDIA_BUCKET ?? 'foodgrid-media-local'}.s3.amazonaws.com`;
  const prefix = `${base.replace(/\/$/, '')}/${folder}/${userId}/`;
  const ext = folder === 'kyc' ? 'jpg|png|webp|pdf' : 'jpg|png|webp';
  return (
    url.startsWith(prefix) &&
    new RegExp(`^\\d{4}-\\d{2}-\\d{2}/[0-9a-f-]{36}\\.(${ext})$`).test(url.slice(prefix.length))
  );
}
