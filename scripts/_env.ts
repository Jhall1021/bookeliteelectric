/**
 * Load .env into process.env for standalone scripts.
 *
 * Prisma's CLI reads .env; a plain `tsx scripts/foo.ts` does not, so
 * REHEARSAL_DATABASE_URL sitting in .env is invisible to these scripts unless
 * it is also exported. Verified, not assumed — a probe var in .env came back
 * undefined.
 *
 * Never overwrites something already in the environment, so an explicit
 * `REHEARSAL_DATABASE_URL=... npx tsx ...` still wins.
 */
import { readFileSync } from "node:fs";

/**
 * Both files, because this project uses both: DATABASE_URL lives in .env and
 * the auth/mail secrets live in .env.local. Loading only one would work for
 * whichever file the reader happened to pick and silently fail for the other.
 * Earlier entries win, so .env.local overrides .env only where .env is silent.
 */
export function loadEnv(files: string[] = [".env.local", ".env"]): void {
  for (const f of files) loadOne(f);
}

function loadOne(file: string): void {
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch { return; }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}
