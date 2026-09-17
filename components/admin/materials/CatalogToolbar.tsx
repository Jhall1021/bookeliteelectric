import type { MaterialCategory } from "@/lib/materialCategory";
import type { StatusFilterBucket } from "@/lib/materialCatalog";

export const STATUS_FILTERS: { value: "all" | StatusFilterBucket; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "confirmed", label: "Confirmed" },
  { value: "supplier_linked", label: "Supplier linked" },
];

const controlClass = "rounded-card border border-cardline bg-white px-3 py-2 text-sm focus:border-electric";

/**
 * Search first and largest, category and status after — same functionality
 * as before, restyled as plain bordered controls sitting directly on the
 * page rather than boxed inside another card. "Clear filters" only appears
 * once something is actually narrowing the list, so it never sits there as
 * a dead control on the default, unfiltered view.
 */
export function CatalogToolbar({
  search, onSearch,
  category, onCategory, categoriesPresent,
  status, onStatus,
  isFiltering, onClear,
}: {
  search: string; onSearch: (v: string) => void;
  category: "All" | MaterialCategory; onCategory: (v: "All" | MaterialCategory) => void;
  categoriesPresent: MaterialCategory[];
  status: "all" | StatusFilterBucket; onStatus: (v: "all" | StatusFilterBucket) => void;
  isFiltering: boolean; onClear: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search materials"
        className={`${controlClass} w-full sm:flex-1`}
        aria-label="Search materials"
      />
      <select
        value={category}
        onChange={(e) => onCategory(e.target.value as "All" | MaterialCategory)}
        className={`${controlClass} w-full sm:w-auto`}
        aria-label="Filter by category"
      >
        <option value="All">All categories</option>
        {categoriesPresent.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={status}
        onChange={(e) => onStatus(e.target.value as "all" | StatusFilterBucket)}
        className={`${controlClass} w-full sm:w-auto`}
        aria-label="Filter by status"
      >
        {STATUS_FILTERS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {isFiltering && (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-sm font-medium text-electric hover:text-electric-hover sm:ml-1"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
