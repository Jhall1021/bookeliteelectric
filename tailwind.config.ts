import type { Config } from "tailwindcss";

// Brand tokens — derived from the approved storyboard (navy/blue/white,
// premium-but-approachable home-services look) plus a signature motif pulled
// from the Elite logo's radiating-bulb mark: thin "ray" accents used
// sparingly behind price confirmations and trust badges, never as decoration
// everywhere. This is the one deliberate risk — everything else stays quiet
// and disciplined per the brief ("clean, modern, trustworthy, premium but
// approachable, avoid stereotypical contractor design").

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0F1E3C", // header, nav, primary headline text
          light: "#1B2E54",
        },
        electric: {
          DEFAULT: "#2452D9", // primary CTA / links — "Book Your Service"
          hover: "#1E44BD",
        },
        warmwhite: "#FAFAF8", // page background
        slate: {
          DEFAULT: "#64748B", // secondary/body text
          light: "#94A3B8",
        },
        success: "#16A34A", // price-confirmation checkmarks
        charcoal: "#111827", // footer, logo black
        cardline: "#E7E5E0", // hairline borders on cards
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 30, 60, 0.06), 0 1px 8px rgba(15, 30, 60, 0.04)",
      },
    },
  },
  plugins: [],
} satisfies Config;
