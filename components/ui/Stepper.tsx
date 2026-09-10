"use client";

/**
 * A compact horizontal progress indicator — replaces Guided Setup's old
 * vertical StageRail (app/dashboard/setup/StageRail.tsx), which showed all
 * seven stages as an always-open list. This shows the same seven stages as
 * a single row: where you've been, where you are, what's left.
 *
 * FOUR VISUAL STATES, THREE MEANINGS. "complete" and "attention" are both
 * stages you've already passed — the difference is whether the readiness
 * engine still has something to say about it (a warning or blocker left
 * behind after you moved on). "active" is simply which one you're looking
 * at right now, regardless of its own findings. "upcoming" is a stage
 * you haven't reached yet. This maps onto the three states a contractor
 * actually needs to tell apart — unfinished, needs attention, complete —
 * without a step's own current-ness being confused for either.
 */
export type StepState = "complete" | "active" | "attention" | "upcoming";
export type Step = { key: string; title: string; state: StepState };

export function Stepper({ steps, onSelect }: { steps: Step[]; onSelect?: (key: string) => void }) {
  return (
    <ol className="flex items-start gap-1 overflow-x-auto pb-2" aria-label="Setup progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex min-w-0 flex-1 items-start">
          <button
            type="button"
            onClick={() => onSelect?.(s.key)}
            disabled={!onSelect}
            aria-current={s.state === "active" ? "step" : undefined}
            className="flex min-w-[96px] flex-col items-center gap-1.5 px-1.5 text-center disabled:cursor-default"
          >
            <StepDot index={i + 1} state={s.state} />
            <span
              className={`text-[11px] font-medium leading-tight ${
                s.state === "active" ? "text-navy" : s.state === "upcoming" ? "text-slate" : "text-navy"
              }`}
            >
              {s.title}
            </span>
          </button>
          {i < steps.length - 1 && (
            <div className={`mt-3.5 h-px flex-1 ${s.state === "complete" ? "bg-success/50" : "bg-cardline"}`} aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
}

function StepDot({ index, state }: { index: number; state: StepState }) {
  if (state === "complete") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success text-white">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-electric text-sm font-bold text-white ring-4 ring-electric/20">
        {index}
      </span>
    );
  }
  if (state === "attention") {
    return (
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-p2b-amber-ink/60 bg-p2b-amber-tint text-sm font-bold text-p2b-amber-ink">
        {index}
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-p2b-amber-ink" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-cardline text-sm font-bold text-slate">
      {index}
    </span>
  );
}
