/**
 * REVIEW OF c687467: top-level error output (a thrown Error's own message
 * or stack, which can legitimately originate from Prisma or fetch and
 * embed a raw connection string) must never reach the console un-sanitized.
 * Applies `init-preview-database.ts`'s own `sanitizeSecrets()` (its
 * `//user:pass@` redaction) FIRST, then also strips any literal occurrence
 * of each caller-supplied secret verbatim — for the one secret shape
 * `sanitizeSecrets()`'s connection-string pattern cannot catch: an opaque
 * bearer value like the Vercel bypass token, which never appears inside a
 * `//user:pass@` URL segment.
 */
import { sanitizeSecrets } from "./init-preview-database";

export function sanitizeForLog(text: string, extraSecrets: Array<string | undefined> = []): string {
  let out = sanitizeSecrets(text);
  for (const secret of extraSecrets) {
    if (secret) out = out.split(secret).join("[redacted]");
  }
  return out;
}
