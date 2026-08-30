"use client";

import { createContext, useContext } from "react";
import { ELITE_V1_STRUCTURE, type ThemeStructure } from "@/lib/theme/structure";

/**
 * The resolved STRUCTURE, available to any storefront component — ADR-015
 * Phase 3.
 *
 * Color reaches components through CSS custom properties, which need no
 * context. Composition cannot: whether the header is one row or two is a
 * branch in the tree, not a value in a stylesheet.
 *
 * What this is NOT: a way to ask which contractor is being rendered. Nothing
 * downstream branches on identity — only on the composition their chosen
 * variant asked for. Two contractors on the same variant render byte-identical
 * markup, and that is the property that keeps this from becoming a pile of
 * per-customer special cases.
 */
const StructureContext = createContext<ThemeStructure>(ELITE_V1_STRUCTURE);

export function ThemeStructureProvider(
  { structure, children }: { structure: ThemeStructure; children: React.ReactNode },
) {
  return <StructureContext.Provider value={structure}>{children}</StructureContext.Provider>;
}

/**
 * Falls back to Elite's composition outside a storefront rather than throwing.
 * The chrome renders on pages that belong to no contractor, and a hard failure
 * there would trade a cosmetic default for a blank screen.
 */
export const useStructure = () => useContext(StructureContext);
