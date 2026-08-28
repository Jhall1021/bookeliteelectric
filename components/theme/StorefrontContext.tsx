"use client";

import { createContext, useContext } from "react";
import { ANONYMOUS_IDENTITY, type StorefrontIdentity } from "@/lib/storefrontIdentity";
import { pricingCopy, type PricingCopy } from "@/lib/pricingCopy";

/**
 * The two layers a component may read that are NOT presentation — ADR-016.
 *
 * Identity answers "whose business is this". Pricing copy answers "what can
 * this business promise". Neither is a theme concern, and a theme definition
 * carrying either would put a company name or a fixed-price claim inside a
 * design that other contractors also use.
 *
 * Resolved once at the [site] boundary, alongside the theme.
 */
export type Storefront = { identity: StorefrontIdentity; copy: PricingCopy };

const FALLBACK: Storefront = { identity: ANONYMOUS_IDENTITY, copy: pricingCopy(null) };

const StorefrontCtx = createContext<Storefront>(FALLBACK);

export function StorefrontProvider({ value, children }: { value: Storefront; children: React.ReactNode }) {
  return <StorefrontCtx.Provider value={value}>{children}</StorefrontCtx.Provider>;
}

/**
 * Falls back to an identity that names nobody rather than throwing. The chrome
 * renders on pages belonging to no contractor, and the failure mode of a
 * default must never be "shows the previous tenant".
 */
export const useStorefront = () => useContext(StorefrontCtx);
export const useIdentity = () => useContext(StorefrontCtx).identity;
export const usePricingCopy = () => useContext(StorefrontCtx).copy;
