"use client";

import { useState } from "react";

type State = { status: "idle" | "sending" | "sent" | "error"; message?: string; missing?: string[] };

const FIELDS = [
  { name: "name", label: "Name", type: "text", autoComplete: "name" },
  { name: "company", label: "Company", type: "text", autoComplete: "organization" },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  { name: "runsOn", label: "What do you use to run your business?", type: "text", autoComplete: "off" },
] as const;

/**
 * The closing CTA — ADR-020.
 *
 * "Request Early Access", not "Sign Up". ADR-012 holds Contractor #2 as a
 * release candidate rather than a self-serve signup, so a form that read as
 * instant access would promise something the product deliberately does not do.
 *
 * The four fields are exactly the approved ones. Only name, company and email
 * are required; making "what do you use" mandatory would cost real responses
 * from the people least sure of the answer, who are precisely the standalone
 * customers this product also serves.
 */
export default function EarlyAccess() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.status === "sending") return;
    setState({ status: "sending" });

    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch("/api/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({
          status: "error",
          message: json.error ?? "Something went wrong. Please try again.",
          missing: json.missing,
        });
        return;
      }
      setState({ status: "sent" });
    } catch {
      setState({ status: "error", message: "Couldn’t reach us just now. Please try again." });
    }
  }

  const invalid = new Set(state.missing ?? []);

  return (
    <section id="access" className="bg-p2b-navy py-16 text-[#F4F6F9] lg:pb-[100px] lg:pt-24">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 lg:grid-cols-12 lg:items-end lg:px-[88px]">
        <div className="lg:col-span-7">
          <h2 className="text-[36px] font-bold leading-[1.07] tracking-[-0.022em] lg:text-[54px]">
            We’re onboarding a
            <br />
            small number of
            <br />
            contractors.
          </h2>
          <p className="mt-6 max-w-[46ch] text-[17px] leading-[1.6] text-p2b-navy-text lg:mt-7 lg:text-[19px]">
            Price2Book is being built and proven with real contractors before broader release. If this
            sounds like how you want customers to price and book your services, we’d like to talk.
          </p>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-[3px] border border-p2b-navy-line bg-p2b-navy-card p-6 lg:p-7">
            {state.status === "sent" ? (
              <div role="status" aria-live="polite" className="py-6">
                <div className="text-lg font-semibold">Thanks — we have your request.</div>
                <p className="mt-3 text-[15px] leading-[1.6] text-p2b-navy-text">
                  We read every one of these. Someone will be in touch to talk about how you price and
                  schedule work, and whether Price2Book fits it.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
                {FIELDS.map((f) => (
                  <label key={f.name} className="flex flex-col gap-1.5">
                    <span className="sr-only">{f.label}</span>
                    <input
                      name={f.name}
                      type={f.type}
                      autoComplete={f.autoComplete}
                      placeholder={f.label}
                      aria-invalid={invalid.has(f.name) || undefined}
                      className={`rounded-sm border bg-transparent px-4 py-3.5 text-[15px] text-[#F4F6F9] placeholder:text-p2b-navy-muted focus:border-[#4C7FD0] focus:outline-none focus:ring-1 focus:ring-[#4C7FD0] ${
                        invalid.has(f.name) ? "border-[#E0A0A0]" : "border-p2b-navy-line"
                      }`}
                    />
                  </label>
                ))}

                {/* Not display:none — some bots skip hidden inputs. */}
                <input
                  name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
                  className="pointer-events-none absolute h-px w-px opacity-0"
                />

                {state.status === "error" && (
                  <p role="alert" className="text-sm text-[#F0B8B8]">{state.message}</p>
                )}

                <button
                  type="submit"
                  disabled={state.status === "sending"}
                  className="mt-1.5 rounded-sm bg-p2b-accent p-[15px] text-base font-semibold text-white hover:bg-[#1D5FA8] disabled:opacity-60"
                >
                  {state.status === "sending" ? "Sending…" : "Request Early Access"}
                </button>
              </form>
            )}
            <p className="mt-[18px] text-[13px] leading-[1.5] text-p2b-navy-muted">
              No card required. Just a conversation about whether Price2Book fits how you work.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
