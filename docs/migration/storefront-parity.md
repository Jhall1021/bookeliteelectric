# Storefront rendering parity — ADR-015

## Why this exists

Phase 1 moved the storefront's palette from hardcoded Tailwind hexes to CSS
custom properties. That is a change to *how* colour reaches the browser and
must be a change to *nothing else*. Until that separation is proven, "Elite
looks like Elite" and "Elite's CSS is hardcoded" are the same fact, and no
second contractor can be given a different look without forking the storefront.

## What the probe measures

`scripts/storefront-parity-probe.ts` prints a snippet that hashes the computed
style of every rendered element on a page. Computed style resolves custom
properties to actual values, so an indirection that changes nothing yields an
identical hash — and one that changes anything cannot.

This is stronger than a screenshot diff on the axis that matters: it is
exhaustive over every element and immune to antialiasing noise. It does not
measure layout geometry, so pair it with a look at the page when a change could
move boxes rather than repaint them.

## Procedure

1. `npx tsx scripts/storefront-parity-probe.ts` and keep the snippet.
2. On the tree WITHOUT the change (`git stash push -u`), start the dev server
   and run the snippet on each page below. Record the hashes.
3. `git stash pop`, restart the dev server (a `tailwind.config.ts` change is
   not reliably picked up by HMR), and run the snippet again.
4. Every hash must match.

If a hash differs, do not accept it on the strength of the page looking right.
Swap `hash` for a per-property distinct-value map to localise it.

## Pages

    /elite-electric                                       153 elements
    /elite-electric/services                              123
    /elite-electric/services/tv-media/tv-installation      42
    /elite-electric/how-it-works                           59
    /elite-electric/service-area                           45

Chosen for coverage rather than importance: the marketing home, a category
grid, a service detail with the question tree, a long-copy page, and the page
carrying the inline SVG map (the one place a brand colour was written into a
component rather than a class).

## Phase 1 result — 2026-08-28

All five pages hashed identically before and after tokenization.

    /elite-electric                                    e658e6737292a6a1…
    /elite-electric/services                           ea3790522a0e9bf5…
    /elite-electric/services/tv-media/tv-installation  06e2d3dc12e1fb88…
    /elite-electric/how-it-works                       dc77a05ce2f9e39f…
    /elite-electric/service-area                       16a69b2f779db1bb…

One difference surfaced and was resolved rather than waved through: the old
`fontFamily` computed to `Inter, system-ui, sans-serif, system-ui, sans-serif`
because the config appended fallbacks that `--font-display` already carried.
The duplicated tail is unreachable and selects the same face, so the probe
collapses duplicate families — see the note in the probe source. Every other
property matched element-for-element without normalization.
