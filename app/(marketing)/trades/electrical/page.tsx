import type { Metadata } from "next";
import TradePage, { type TradePageData } from "@/components/marketing/trades/TradePage";
import { ELECTRICAL_TEMPLATE } from "@/components/marketing/trades/electricalTemplate";

/**
 * /trades/electrical — SITEMAP.md.
 *
 * AN EXPLICIT ROUTE, NOT A [trade] SEGMENT, and that is a release control
 * rather than a style preference. A dynamic segment is a generic mechanism for
 * resolving a trade into a public page, which means "plumbing" or "hvac" or
 * some future config value could resolve into a live-looking page before the
 * capability behind it is allowed to ship. With one file per trade the gate is
 * the strongest kind there is: no page file, no page.
 *
 * The layout underneath is shared — components/marketing/trades/TradePage —
 * so electrical establishes the grammar and plumbing drops into it without a
 * redesign. What is NOT shared is the decision to publish.
 *
 * Everything factual on this page is captured from the canonical electrical
 * template by scripts/capture-trade-electrical.ts and drift-checked in the
 * gate. This file supplies only the two sentences that are marketing rather
 * than product truth.
 */
export const metadata: Metadata = {
  title: "Price2Book for Electricians — price and book residential electrical work online",
  description:
    "Price2Book ships with residential electrical service structure already built: the categories, the questions that change scope, and the rules that decide what can be priced online and what cannot.",
  alternates: { canonical: "/trades/electrical" },
};

export const dynamic = "force-dynamic";

const DATA: TradePageData = {
  title: "Price2Book for Electricians",
  lead:
    "Let homeowners price and book the electrical work you already know how to price — the outlet swaps, the fixture changes, the fan replacements — while everything that needs your eyes on it keeps going the way it does today.",
  categories: ELECTRICAL_TEMPLATE.categories as unknown as TradePageData["categories"],
  example: ELECTRICAL_TEMPLATE.example as unknown as TradePageData["example"],
  counts: ELECTRICAL_TEMPLATE.counts as unknown as Record<string, number>,
};

export default function ElectricalTradePage() {
  return <TradePage data={DATA} />;
}
