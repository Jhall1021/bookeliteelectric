import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Elite Electric & Lighting | Home Services",
  description: "See your price. Pick your time. Book your electrician.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
