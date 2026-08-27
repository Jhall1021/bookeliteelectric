/**
 * Print one environment variable, loading .env.local / .env first.
 *
 * The shell script used to `source` those files directly. That breaks on any
 * value containing shell metacharacters — PLATFORM_FROM_EMAIL holds a display
 * name in angle brackets, which bash reads as a redirect and rejects with a
 * syntax error. The TS loader parses with a regex and does not care.
 *
 * So the shell asks this rather than parsing dotenv itself.
 */
import { loadEnv } from "./_env";
loadEnv();
const key = process.argv[2];
if (!key) { console.error("usage: _print-env.ts <KEY>"); process.exit(1); }
process.stdout.write(process.env[key] ?? "");
