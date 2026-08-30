"use client";

import { useRef, useState } from "react";

type Errors = Record<string, string>;
type State = { status: "idle" | "sending" | "sent" | "error"; message?: string; errors?: Errors };

/** Kept in step with the server, which accepts only these values. */
const TRADES = ["Residential electrical", "Plumbing", "HVAC", "Multi-trade", "Something else"];
const RUNS_ON = [
  "Jobber", "ServiceTitan", "Housecall Pro", "Another field-service platform",
  "Google or Outlook Calendar", "Spreadsheets or paper", "Nothing yet",
];
const CREW_SIZES = ["Just me", "2–3", "4–6", "7–12", "13 or more"];

const FIELD =
  "w-full rounded-sm border bg-transparent px-4 py-3.5 text-[15px] text-[#F4F6F9] " +
  "placeholder:text-p2b-navy-muted focus:outline-none focus:ring-1";
const OK = "border-p2b-navy-line focus:border-[#4C7FD0] focus:ring-[#4C7FD0]";
const BAD = "border-[#E0A0A0] focus:border-[#E0A0A0] focus:ring-[#E0A0A0]";

/**
 * The closing CTA — ADR-020.
 *
 * "Request Early Access", not "Sign Up". ADR-012 holds Contractor #2 as a
 * release candidate rather than a self-serve signup, so a form that read as
 * instant access would promise something the product deliberately does not do.
 *
 * VALIDATION IS CLIENT AND SERVER, AND THE SERVER IS THE ONE THAT COUNTS.
 *
 * The form previously had no required fields at all — the button submitted
 * with every box empty. It now validates before sending and shows the message
 * beside the field it belongs to, but the endpoint validates independently:
 * this runs in the visitor's browser, and anything that runs there is a
 * convenience, never a guarantee.
 *
 * Trade is required because it is the first thing that decides whether
 * Price2Book can serve someone at all. Software and crew size are optional
 * menus — countable afterwards, and cheap enough to skip that they don't cost
 * a response.
 */
function FieldRow({ name, label, type = "text", autoComplete, error }: {
  name: string; label: string; type?: string; autoComplete?: string; error?: string;
}) {
  return (
    <div>
      <label htmlFor={`ea-${name}`} className="sr-only">{label}</label>
      <input
        id={`ea-${name}`} name={name} type={type} autoComplete={autoComplete} placeholder={label}
        aria-invalid={!!error} aria-describedby={error ? `ea-${name}-err` : undefined}
        className={`${FIELD} ${error ? BAD : OK}`}
      />
      {error && <p id={`ea-${name}-err`} className="mt-1.5 text-[13px] text-[#F0B8B8]">{error}</p>}
    </div>
  );
}

function ChoiceRow({ name, label, options, required, error }: {
  name: string; label: string; options: string[]; required?: boolean; error?: string;
}) {
  // A select showing its placeholder must LOOK like a placeholder. Left alone
  // it renders in the input color and reads as an answered field.
  const [chosen, setChosen] = useState(false);
  return (
    <div>
      <label htmlFor={`ea-${name}`} className="sr-only">{label}</label>
      <select
        id={`ea-${name}`} name={name} defaultValue=""
        onChange={(e) => setChosen(e.currentTarget.value !== "")}
        aria-invalid={!!error} aria-describedby={error ? `ea-${name}-err` : undefined}
        className={`${FIELD} ${error ? BAD : OK} appearance-none bg-p2b-navy-card ${
          chosen ? "text-[#F4F6F9]" : "text-p2b-navy-muted"}`}
      >
        <option value="" disabled>{label}{required ? "" : " (optional)"}</option>
        {options.map((o) => <option key={o} value={o} className="text-[#F4F6F9]">{o}</option>)}
      </select>
      {error && <p id={`ea-${name}-err`} className="mt-1.5 text-[13px] text-[#F0B8B8]">{error}</p>}
    </div>
  );
}

export default function EarlyAccess() {
  const [state, setState] = useState<State>({ status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);

  function validate(data: Record<string, string>): Errors {
    const e: Errors = {};
    if (!data.name?.trim()) e.name = "Please tell us your name.";
    if (!data.company?.trim()) e.company = "Please tell us your company.";
    if (!data.email?.trim()) e.email = "Please give us an email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email.trim()))
      e.email = "That email address doesn’t look right.";
    if (!data.trade) e.trade = "Please choose the trade you run.";
    return e;
  }

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (state.status === "sending") return;

    const data = Object.fromEntries(
      new FormData(ev.currentTarget).entries(),
    ) as Record<string, string>;

    const errors = validate(data);
    if (Object.keys(errors).length) {
      setState({ status: "error", message: "Please check the highlighted fields.", errors });
      // Move focus to the first problem rather than leaving a keyboard or
      // screen-reader user to hunt for it.
      formRef.current?.querySelector<HTMLElement>(`[name="${Object.keys(errors)[0]}"]`)?.focus();
      return;
    }

    setState({ status: "sending" });
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
          errors: json.errors ?? {},
        });
        return;
      }
      setState({ status: "sent" });
    } catch {
      setState({ status: "error", message: "Couldn’t reach us just now. Please try again." });
    }
  }

  const err = state.errors ?? {};

  return (
    <section id="access" className="bg-p2b-navy py-16 text-[#F4F6F9] lg:pb-[100px] lg:pt-24">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 lg:grid-cols-12 lg:items-start lg:px-[88px]">
        <div className="lg:col-span-6">
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

        <div className="lg:col-span-6">
          <div className="rounded-[3px] border border-p2b-navy-line bg-p2b-navy-card p-6 lg:p-7">
            {state.status === "sent" ? (
              <div role="status" aria-live="polite" className="py-4">
                <div className="text-lg font-semibold">Thanks — we have your request.</div>
                <p className="mt-3 text-[15px] leading-[1.6] text-p2b-navy-text">
                  Here’s what happens next. We read every one of these ourselves — there is no
                  automated sequence. Someone will email you from{" "}
                  <span className="text-[#F4F6F9]">admin@price2book.com</span> to arrange a
                  conversation about how you price and schedule work, and whether Price2Book fits
                  it. If it isn’t a fit we’ll tell you that too.
                </p>
                <p className="mt-3 text-[15px] leading-[1.6] text-p2b-navy-text">
                  Nothing is set up and no account is created until after we’ve spoken.
                </p>
              </div>
            ) : (
              <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-3.5">
                <FieldRow name="name" label="Name" autoComplete="name" error={err.name} />
                <FieldRow name="company" label="Company" autoComplete="organization" error={err.company} />
                <FieldRow name="email" label="Email" type="email" autoComplete="email" error={err.email} />
                <ChoiceRow name="trade" label="Which trade do you run?" options={TRADES} required error={err.trade} />
                <ChoiceRow name="runsOn" label="What do you use to run your business?" options={RUNS_ON} error={err.runsOn} />
                <ChoiceRow name="crewSize" label="How many crews or technicians?" options={CREW_SIZES} error={err.crewSize} />

                {/* Not display:none — some bots skip hidden inputs. */}
                <input
                  name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
                  className="pointer-events-none absolute h-px w-px opacity-0"
                />

                {state.status === "error" && state.message && (
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

            {/* What is actually stored, in the words of the code that stores
                it: name, company, email, trade and two optional answers. No
                tracking identifiers, no IP address, no user agent. */}
            <p className="mt-[18px] text-[13px] leading-[1.5] text-p2b-navy-muted">
              No card required. We keep what you enter here — your name, company, email, trade and
              the two optional answers — to have that conversation, and nothing else. We don’t sell
              it, and we don’t add you to a mailing list.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
