"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPhoto } from "@/lib/upload";
import { useSiteFetch, useStorefrontBase } from "@/components/site/SiteContext";

type Props = {
  serviceName: string;
  serviceId: string;
  labels: string[];
  /** Safety instructions from the photo groups used — shown once, not per label. */
  safetyNotes?: string[];
  /** Running total at the point the flow stopped — a floor, never an estimate. */
  floorPriceCents?: number | null;
  /** Optional free-text note, lifted to the engine so it lands in answersSnapshot. */
  note?: string;
  onNoteChange?: (v: string) => void;
  answers: Record<string, string>;
};

type UploadState = "idle" | "uploading" | "done" | "error";

/**
 * Real photo upload + quote submission — replaces the Phase 2 disabled-
 * button stub. One file input per required photo (from the AnswerOption
 * that triggered this branch), plus contact info so the office knows who
 * to price this for. Files upload directly to R2 via a presigned URL, then
 * a Quote record is created once everything's in.
 */
export default function PhotoReviewNotice({
  serviceName,
  serviceId,
  labels,
  safetyNotes = [],
  floorPriceCents,
  note = "",
  onNoteChange,
  answers,
}: Props) {
  // Storefront navigation carries the site slug. These were root paths,
  // working only because the legacy Elite redirects catch them.
  const base = useStorefrontBase();
  // ADR §2.2 — customer-facing calls carry the storefront identifier.
  const siteFetch = useSiteFetch();
  const router = useRouter();
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allPhotosSelected = labels.every((label) => files[label]);
  const canSubmit = allPhotosSelected && contact.name && contact.email && !submitting;

  function handleFileChange(label: string, file: File | null) {
    setFiles((prev) => ({ ...prev, [label]: file }));
    setUploadStates((prev) => ({ ...prev, [label]: "idle" }));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      // Upload every photo first, tracking per-label progress.
      const uploadedPhotos: { url: string; label: string }[] = [];
      for (const label of labels) {
        const file = files[label];
        if (!file) continue;
        setUploadStates((prev) => ({ ...prev, [label]: "uploading" }));
        const url = await uploadPhoto(file);
        uploadedPhotos.push({ url, label });
        setUploadStates((prev) => ({ ...prev, [label]: "done" }));
      }

      const res = await siteFetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The running total where the flow stopped, so the cart can show
          // "From $X" rather than nothing at all.
          floorPriceCents,
          serviceId,
          answersSnapshot: answers,
          photos: uploadedPhotos,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
        }),
      });

      if (!res.ok) throw new Error("Could not submit your photos");
      const data = await res.json();
      // Back to the visit, not away from it. This used to land on a quote
      // page, which ended the session — anything already in the cart was
      // abandoned, and a first-time customer left with nothing booked.
      router.push(`${base}/my-visit`);
    } catch (err) {
      setError("Something went wrong uploading your photos. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-card border border-cardline bg-white p-8 shadow-card">
      <h2 className="font-display text-xl font-bold text-navy">We can price this remotely.</h2>
      <p className="mt-2 text-sm text-slate">
        Your answers for {serviceName} mean we need a few photos to confirm the price — no
        estimate visit required. We'll review them and send back a fixed price.
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

      <div className="mt-6 space-y-3 border-t border-cardline pt-6">
        <div>
          <label className="text-sm font-medium text-navy">Full name</label>
          <input
            required
            type="text"
            value={contact.name}
            onChange={(e) => setContact({ ...contact, name: e.target.value })}
            className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-navy">Email</label>
          <input
            required
            type="email"
            value={contact.email}
            onChange={(e) => setContact({ ...contact, email: e.target.value })}
            className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-navy">Phone</label>
          <input
            type="tel"
            value={contact.phone}
            onChange={(e) => setContact({ ...contact, phone: e.target.value })}
            className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
          />
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-6 w-full rounded-pill bg-electric py-3.5 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-40"
      >
        {submitting ? "Submitting..." : "Submit for Review"}
      </button>
      <p className="mt-3 text-xs text-slate">
        We'll email you a fixed price, usually within one business day.
      </p>
    </div>
  );
}
