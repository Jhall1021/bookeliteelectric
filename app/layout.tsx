import type { Metadata } from "next";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Elite Electric & Lighting | Home Services",
  description: "See your price. Pick your time. Book your electrician.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
