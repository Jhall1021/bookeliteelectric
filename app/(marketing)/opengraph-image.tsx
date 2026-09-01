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
        {/* The wordmark, in the brand's own colors — navy with a green "2".
            Set as text rather than as the delivered artwork because this
            renders on the edge, where the only ways to place a PNG are a
            base64 blob checked into the source or a network fetch that can
            fail and take the whole card with it. */}
        <div style={{ display: "flex", alignItems: "baseline", fontSize: 38, fontWeight: 700, letterSpacing: "-0.03em" }}>
          <div style={{ color: "#003091" }}>Price</div>
          <div style={{ color: "#3AB54A" }}>2</div>
          <div style={{ color: "#003091" }}>Book</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, fontWeight: 700, color: "#14181F", lineHeight: 1.02, letterSpacing: "-0.03em" }}>
            Your pricing.
          </div>
          <div style={{ fontSize: 96, fontWeight: 700, color: "#14181F", lineHeight: 1.02, letterSpacing: "-0.03em" }}>
            Your schedule.
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#57534A", lineHeight: 1.35, maxWidth: 900 }}>
            Add upfront prices and real availability to the website you already have — without
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
