"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that shows its own form is pending — `useFormStatus` only
 * reads the nearest parent `<form>`, so this must render INSIDE it, never
 * beside it. No logic of its own: the server action it submits to still
 * decides everything.
 */
export function SubmitButton({ children, pendingLabel }: { children: React.ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="self-end rounded-md bg-electric px-4 py-2 text-sm font-medium text-white hover:bg-electric/90 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
