import Image from "next/image";
import Link from "next/link";

export default function ServiceAreaPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="font-display text-3xl font-bold text-navy">
        Proudly Serving Monmouth &amp; Ocean Counties, NJ
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-slate">
        We're currently booking residential electrical service throughout Monmouth and Ocean
        Counties, with more service areas planned as we grow.
      </p>

      <div className="relative mx-auto mt-8 h-96 w-96 max-w-full">
        <Image
          src="/images/nj-service-area-map.png"
          alt="Map of New Jersey with Monmouth and Ocean counties highlighted as our service area"
          fill
          className="object-contain"
          sizes="(min-width: 768px) 384px, 90vw"
        />
      </div>

      <div className="mt-10">
        <Link
          href="/services"
          className="inline-block rounded-pill bg-electric px-7 py-3 font-semibold text-white transition hover:bg-electric-hover"
        >
          Book Your Service
        </Link>
      </div>
    </main>
  );
}
