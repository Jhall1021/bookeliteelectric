/**
 * Plumbing Template V1 — the whole public surface of lib/plumbing.
 *
 * Everything under this directory is CANONICAL and TRADE-LEVEL. There is no
 * contractor here, no price, no rate, no allowance and no boundary value, and
 * anything that arrives with one has crossed the line ADR-014 draws.
 *
 * Nothing in this directory reads the database or the network. The template is
 * data plus pure functions, which is what lets scripts/verify-plumbing-template.ts
 * prove its invariants without a connection and lets a quote be reconstructed
 * from an answer snapshot months after the fact.
 */

export * from "./primitives";
export * from "./gates";
export * from "./families";
export * from "./metadata";
export * from "./appointments";
export * from "./roles";
export * from "./policies";
export * from "./catalog";
export * from "./composition";
export * from "./publish";
export * from "./mappings";
export * from "./visualAssist";
export * from "./scope";
export * from "./intents";

/** Bumped when the canonical set changes in a way a contractor should see. */
export const PLUMBING_TEMPLATE_TRADE = "plumbing";
export const PLUMBING_TEMPLATE_VERSION = 1;
