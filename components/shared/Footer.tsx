import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-charcoal py-12 text-white">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div>
            <Image
              src="/images/elite-logo.png"
              alt="Elite Electric & Lighting"
              width={44}
              height={44}
              className="mb-4 invert"
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

        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-white/10 pt-6 text-xs text-white/50">
          <span>
            © {new Date().getFullYear()} Elite Electric &amp; Lighting. All rights reserved.
          </span>
          {/* Required by SimpleMaps' free licence: their ZIP database powers
              the service-area check at checkout, and using the Basic tier
              obliges a visible link on a page reachable from the root.
              If the ZIP reference data is ever sourced elsewhere, this link
              should go with it. */}
          <a
            href="https://simplemaps.com/data/us-zips"
            className="hover:text-white/80"
            rel="noopener"
          >
            ZIP code data by SimpleMaps
          </a>
        </div>
      </div>
    </footer>
  );
}
