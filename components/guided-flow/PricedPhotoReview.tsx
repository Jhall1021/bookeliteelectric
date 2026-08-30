"use client";

import { useState } from "react";
import { formatCents } from "@/lib/flow-types";
import { uploadPhoto } from "@/lib/upload";
import { usePricingCopy } from "@/components/theme/StorefrontContext";

type Props = {
  serviceName: string;
  /** Overrides the button wording. See Service.ctaLabel. */
  ctaLabel?: string | null;
  priceCents: number;
  disclaimer: string | null;
  labels: string[];
  /** Safety instructions from the photo groups used — shown once, not per label. */
  safetyNotes?: string[];
  /** Optional free-text note, lifted to the engine so it lands in answersSnapshot. */
  note?: string;
  onNoteChange?: (v: string) => void;
  onConfirm: (photos: { url: string; label: string }[]) => Promise<void>;
};

type UploadState = "idle" | "uploading" | "done";

/**
 * The price-is-locked variant of photo review.
 *
 * PhotoReviewNotice (the sibling component) is for branches where we CAN'T
 * price the job yet — the customer submits photos and waits for us. This one
 * is the opposite case: the answers already determined the price, and the
 * photos exist so the technician shows up prepared. So the number is stated
 * plainly up top, the photos are framed as prep rather than as a condition,
 * and the customer goes straight to scheduling.
 *
 * Which of the two renders is driven by AnswerOption.photosBlockBooking.
 */
export default function PricedPhotoReview({
  serviceName,
  ctaLabel,
  priceCents,
  disclaimer,
  labels,
  safetyNotes = [],
  note = "",
  onNoteChange,
  onConfirm,
}: Props) {
  const pcopy = usePricingCopy();
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = labels.every((label) => files[label]);

  function handleFileChange(label: string, file: File | null) {
    setFiles((prev) => ({ ...prev, [label]: file }));
    setUploadStates((prev) => ({ ...prev, [label]: "idle" }));
  }

  async function handleSubmit() {
    if (!allSelected || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const uploaded: { url: string; label: string }[] = [];
      for (const label of labels) {
        const file = files[label];
        if (!file) continue;
        setUploadStates((prev) => ({ ...prev, [label]: "uploading" }));
        const url = await uploadPhoto(file);
        uploaded.push({ url, label });
        setUploadStates((prev) => ({ ...prev, [label]: "done" }));
      }
      await onConfirm(uploaded);
    } catch {
      // Leave the already-uploaded files marked done so a retry only re-sends
      // what actually failed, and keep the button live rather than stranding
      // the customer on a dead screen.
      setError("Something went wrong uploading your photos. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-card border border-cardline bg-white p-8 shadow-card">
      <div className="rounded-card bg-warmwhite p-5 text-center">
        <div className="text-sm text-muted">{pcopy.priceForServiceLead} {serviceName}</div>
        <div className="mt-1 font-display text-4xl font-bold text-navy">
          {formatCents(priceCents)}
        </div>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-success/10 px-3 py-1 text-xs font-semibold text-success">
          <span aria-hidden="true">✓</span> Locked in — this is what you&rsquo;ll pay
        </div>
      </div>

      <h2 className="mt-6 font-display text-lg font-bold text-navy">
        One last thing before you schedule
      </h2>
      <p className="mt-2 text-sm text-slate">
        {pcopy.priceSetNotice} We just need a couple of photos so your electrician arrives with the
        right parts and doesn&rsquo;t have to make a second trip. This won&rsquo;t change what you
        pay.
      </p>

      {/* Half of what makes a quote easy is the sentence the customer would
          have said out loud. Never blocks submission. */}
      {onNoteChange && (
        <div className="mt-6">
          <label className="text-sm font-medium text-navy">
            Anything else you'd like us to know?{" "}
            <span className="font-normal text-slate">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={3}
            placeholder="Anything that might help us come prepared"
            className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
          />
        </div>
      )}

      {safetyNotes.length > 0 && (
        <div className="mt-6 rounded-card border border-amber-200 bg-amber-50 p-4">
          {safetyNotes.map((note) => (
            <p key={note} className="text-xs font-medium text-amber-900">
              {note}
            </p>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {labels.map((label) => (
          <div key={label}>
            <label className="text-sm font-medium text-navy">{label}</label>
            {/* No `capture` attribute on purpose. Setting it (this used to
                be capture="environment") makes mobile browsers jump straight
                into the camera and removes the option to pick an existing
                photo — and plenty of customers have already photographed the
                panel or the fixture before they sat down to book. */}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFileChange(label, e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-slate file:mr-4 file:rounded-pill file:border-0 file:bg-electric file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
            {uploadStates[label] === "uploading" && (
              <p className="mt-1 text-xs text-electric">Uploading...</p>
            )}
            {uploadStates[label] === "done" && (
              <p className="mt-1 text-xs text-success">✓ Uploaded</p>
            )}
          </div>
        ))}
      </div>

      {disclaimer && (
        <p className="mt-6 rounded-card bg-warmwhite p-4 text-xs text-slate">{disclaimer}</p>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!allSelected || submitting}
        className="mt-6 w-full rounded-pill bg-electric py-3.5 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-40"
      >
        {submitting
          ? "Uploading..."
          : `${ctaLabel ?? "Add to My Visit"} — ${formatCents(priceCents)}`}
      </button>

      {!allSelected && (
        <p className="mt-3 text-center text-xs text-slate">
          Add {labels.length === 1 ? "the photo" : "all photos"} above to continue
        </p>
      )}
    </div>
  );
}
