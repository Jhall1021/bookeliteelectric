/**
 * Proves R2_ACCOUNT_ID + R2_BUCKET_NAME + the presign route's key shape
 * produce the expected Cloudflare R2 endpoint — WITHOUT any network access.
 *
 * Exists because this development sandbox cannot complete a TLS connection
 * to Cloudflare R2 (docs/design/route-assist-v1.md's cross-device proof
 * note), so the real cross-device browser proof substitutes a local upload
 * for the phone's capture step. That substitution proves the REST of the
 * flow, but proves nothing about whether the real upload URL this app
 * would hand a real browser is actually well-formed. This script closes
 * that gap: `getSignedUrl` (AWS SDK v3) computes a SigV4 signature purely
 * locally — no request is sent — so calling the ACTUAL route handler
 * (`app/api/uploads/presign/route.ts`), not a reimplementation of it, is
 * possible with zero external network access.
 *
 *   npx tsx scripts/verify-upload-presign-url.ts
 */
import { loadEnv } from "./_env";

loadEnv();

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? "ok" : "FAIL"} — ${name}${!cond && detail ? `: ${detail}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_URL"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`  Missing env var(s), cannot proceed: ${missing.join(", ")}`);
    process.exit(1);
  }

  console.log("\nReal presign route, real env, zero network access");

  const { POST } = await import("../app/api/uploads/presign/route");
  const req = new Request("http://localhost/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: "route-photo.png", contentType: "image/png" }),
  });
  const res = await POST(req);
  check("presign route responds 200", res.status === 200, String(res.status));

  const body = (await res.json()) as { uploadUrl?: string; publicUrl?: string };
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_URL;

  check("uploadUrl carries the real R2_ACCOUNT_ID, not a literal 'undefined'", !!body.uploadUrl && !body.uploadUrl.includes("undefined"), body.uploadUrl);
  check(
    "uploadUrl's host is exactly {bucket}.{accountId}.r2.cloudflarestorage.com",
    body.uploadUrl?.startsWith(`https://${bucket}.${accountId}.r2.cloudflarestorage.com/`) ?? false,
    body.uploadUrl
  );
  check("uploadUrl's key lives under quote-photos/ and keeps the filename", /\/quote-photos\/[^/]+-route-photo\.png\?/.test(body.uploadUrl ?? ""), body.uploadUrl);
  check("uploadUrl is presigned (carries an AWS SigV4 signature)", (body.uploadUrl ?? "").includes("X-Amz-Signature="), body.uploadUrl);

  check(
    "publicUrl is {R2_PUBLIC_URL}/quote-photos/{uuid}-route-photo.png",
    new RegExp(`^${publicBase!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/quote-photos/[^/]+-route-photo\\.png$`).test(body.publicUrl ?? ""),
    body.publicUrl
  );

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
