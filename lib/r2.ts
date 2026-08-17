import { S3Client } from "@aws-sdk/client-s3";

// R2 is S3-API-compatible, so the standard AWS SDK works against it —
// just pointed at Cloudflare's endpoint instead of AWS's.
//
// requestChecksumCalculation: "WHEN_REQUIRED" is required for R2
// specifically. Newer AWS SDK v3 versions default to adding an
// x-amz-checksum-crc32 header/param to every upload, which R2 doesn't
// support and rejects — this is a documented AWS SDK / R2 compatibility
// issue, not a CORS or credentials problem. Without this line, uploads
// fail even with perfectly correct CORS and credentials.
export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
});
