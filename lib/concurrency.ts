/**
 * `mapWithConcurrency` — extracted from lib/platformReadModel.ts so
 * lib/onboardingReadiness.ts can use it too, without importing FROM
 * platformReadModel.ts, which already imports `assessOnboarding` FROM
 * onboardingReadiness.ts. This file depends on nothing, so neither side
 * gains a circular import.
 *
 * platformReadModel.ts re-exports this so every existing
 * `import { mapWithConcurrency } from "./platformReadModel"` keeps working
 * unchanged.
 */

/** Run `fn` over `items` with at most `limit` in flight; results in input order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Run independent async tasks with at most `limit` in flight, resolving to
 * their results in input order and typed per position — mapWithConcurrency for
 * a fixed list of differently-typed reads. The first rejection rejects the
 * whole; tasks already started still finish.
 */
export async function allWithConcurrency<T extends readonly (() => Promise<unknown>)[]>(
  limit: number,
  tasks: T,
): Promise<{ -readonly [K in keyof T]: T[K] extends () => Promise<infer R> ? R : never }> {
  return (await mapWithConcurrency([...tasks], limit, (task) => task())) as never;
}
