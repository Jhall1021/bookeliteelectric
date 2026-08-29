import { ImageResponse } from "next/og";

/** The browser-tab mark. Same bolt as the site header, so a tab is recognisable. */
export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#FBFAF7",
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1B4B8F"
             strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
        </svg>
      </div>
    ),
    size,
  );
}
