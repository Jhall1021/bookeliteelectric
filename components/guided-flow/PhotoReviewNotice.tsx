"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPhoto } from "@/lib/upload";

type Props = {
  serviceName: string;
  serviceId: string;
  labels: string[];
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
export default function PhotoReviewNotice({ serviceName, serviceId, labels, answers }: Props) {
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

      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      router.push(`/quote/${data.quoteId}`);
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

      <div className="mt-6 space-y-4">
        {labels.map((label) => (
          <div key={label}>
            <label className="text-sm font-medium text-navy">{label}</label>
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
