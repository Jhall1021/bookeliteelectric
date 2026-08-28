/**
 * Enumerate source files without depending on git.
 *
 * The verifiers used `git ls-files`, which is a fine way to list tracked files
 * and a poor way to list SOURCE files: it needs a git working tree. A Vercel
 * CLI deploy uploads the source without `.git`, so every one of them threw
 * `Command failed: git ls-files` and took the build down — a gate failing for
 * a reason unrelated to anything it checks.
 *
 * Git is still preferred when present: it honours .gitignore for free, so a
 * stray file in node_modules or .next cannot join the scan. The filesystem
 * walk is the fallback, with the same exclusions applied by hand.
 */
import { execSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";

const SKIP_DIR = new Set([
  "node_modules", ".git", ".next", ".vercel", "dist", "build", "coverage", ".turbo",
]);

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = `${dir}/${name}`;
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * Tracked-and-untracked source files under the given roots, git or not.
 *
 * Returns paths relative to the repository root either way, so callers can
 * compare against literal paths without caring which mechanism was used.
 */
export function sourceFiles(roots: string[], pattern = /\.tsx?$/): string[] {
  try {
    const quoted = roots.map((r) => `'${r}'`).join(" ");
    const out = execSync(`git ls-files -co --exclude-standard ${quoted}`, {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    });
    const files = out.split("\n").filter((f) => f && pattern.test(f) && existsSync(f));
    // An empty result from a real git tree is possible; an empty result
    // because git failed is not — that throws and lands in the catch.
    if (files.length) return files;
  } catch {
    // No git, or not a working tree. Fall through to the walk.
  }
  return roots.flatMap((r) => walk(r)).filter((f) => pattern.test(f)).map((f) => f.replace(/^\.\//, ""));
}
