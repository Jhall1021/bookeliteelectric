/**
 * HVAC Template V1 — the whole public surface of lib/hvac.
 *
 * Mirrors lib/plumbing/index.ts's own promise: everything under this
 * directory is CANONICAL and TRADE-LEVEL. No contractor, no price, no rate,
 * no allowance. Nothing here reads the database or the network — H1
 * provisions nothing, and scripts/verify-hvac-template.ts proves every
 * invariant it checks without a connection.
 */

export * from "./catalog";
export * from "./appointments";
export * from "./intents";
export * from "./primitives";
export * from "./gates";
export * from "./families";
export * from "./mappings";
export * from "./metadata";
export * from "./scope";

/** Mirrors PLUMBING_TEMPLATE_TRADE / PLUMBING_TEMPLATE_VERSION exactly. */
export const HVAC_TEMPLATE_TRADE = "hvac";
export const HVAC_TEMPLATE_VERSION = 1;
