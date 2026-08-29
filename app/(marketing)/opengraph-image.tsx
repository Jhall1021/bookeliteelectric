import { ImageResponse } from "next/og";

/**
 * The social-sharing card — ADR-020.
 *
 * Generated rather than shipped as a binary, so it cannot drift from the
 * headline it quotes: the page and the card are built from the same words.
 */
export const runtime = "edge";
export const alt = "Price2Book — Your pricing. Your schedule.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", background: "#FBFAF7", padding: "72px 80px",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1B4B8F"
               strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
          </svg>
          <div style={{ fontSize: 34, fontWeight: 700, color: "#14181F", letterSpacing: "-0.03em" }}>
            Price2Book
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, fontWeight: 700, color: "#14181F", lineHeight: 1.02, letterSpacing: "-0.03em" }}>
            Your pricing.
          </div>
          <div style={{ fontSize: 96, fontWeight: 700, color: "#14181F", lineHeight: 1.02, letterSpacing: "-0.03em" }}>
            Your schedule.
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#57534A", lineHeight: 1.35, maxWidth: 900 }}>
            Upfront prices and real availability for residential service contractors — without
            replacing the software you already use.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 3, background: "#1B4B8F" }} />
          <div style={{ fontSize: 22, color: "#1B4B8F", letterSpacing: "0.09em", fontWeight: 600 }}>
            FOR RESIDENTIAL SERVICE CONTRACTORS
          </div>
        </div>
      </div>
    ),
    size,
  );
}
