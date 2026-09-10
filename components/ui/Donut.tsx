/**
 * A two-slice ring chart — real counts, two colors, nothing fancier. No
 * charting library for one shape: a stroked circle with a dash offset does
 * the whole job.
 */
export function Donut({
  segments, total, centerLabel, centerValue, size = 120,
}: {
  segments: { value: number; className: string }[];
  total: number;
  centerLabel: string;
  centerValue: number;
  size?: number;
}) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-cardline" />
        {total > 0 && segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * circumference;
          const el = (
            <circle
              key={i}
              cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              className={s.className}
              stroke="currentColor"
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-2xl font-bold text-navy">{centerValue}</span>
        <span className="text-[10px] uppercase tracking-wide text-slate">{centerLabel}</span>
      </div>
    </div>
  );
}
