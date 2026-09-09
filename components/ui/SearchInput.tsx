"use client";

/**
 * A plain controlled search box. Filtering happens client-side over data
 * the page already fetched — small directories (dozens to a few hundred
 * rows) don't need a server round trip and a new guarded query just to
 * narrow what's already on the page.
 */
export function SearchInput({
  value, onChange, placeholder = "Search…", label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
}) {
  return (
    <div className="relative">
      <label htmlFor="admin-search" className="sr-only">{label}</label>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        id="admin-search"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-pill border border-cardline bg-white py-2 pl-9 pr-3 text-sm text-navy placeholder:text-slate focus:border-electric focus:outline-none focus:ring-1 focus:ring-electric"
      />
    </div>
  );
}
