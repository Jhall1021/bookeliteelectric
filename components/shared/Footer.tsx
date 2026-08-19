import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-charcoal py-12 text-white">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div>
            {/* Reversed (white-on-transparent) logo. The default
                elite-logo.png is black artwork on an OPAQUE white
                background, so the previous `invert` class flipped that
                white background to black and rendered a dark box on the
                charcoal footer. A dedicated reversed asset avoids the
                filter entirely. */}
            <Image
              src="/images/elite-logo-white.png"
              alt="Elite Electric & Lighting"
              width={88}
              height={88}
              className="mb-4"
            />
            <div className="text-sm font-semibold text-white">Elite Electric &amp; Lighting</div>
            <address className="mt-2 text-sm not-italic text-white/70">
              1309 Allaire Ave.
              <br />
              Ocean, NJ 07712
            </address>
            <div className="mt-2 text-sm text-white/70">
              <a href="tel:7322047003" className="hover:text-white">732-204-7003</a>
            </div>
            <div className="mt-2 text-xs text-white/50">NJ Electrical License #17272</div>
          </div>

          <nav className="flex flex-col gap-2 text-sm text-white/70 sm:items-end">
            <Link href="/how-it-works" className="hover:text-white">How It Works</Link>
            <Link href="/services" className="hover:text-white">Services &amp; Pricing</Link>
            <Link href="/why-elite" className="hover:text-white">Why Elite</Link>
            <Link href="/service-area" className="hover:text-white">Service Area</Link>
          </nav>
        </div>

        <div className="mt-8 border-t border-white/10 pt-6 text-xs text-white/50">
          © {new Date().getFullYear()} Elite Electric &amp; Lighting. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
