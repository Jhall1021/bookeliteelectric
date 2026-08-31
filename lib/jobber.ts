import { appOrigin } from "./origins";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
export const JOBBER_AUTH_URL = "https://api.getjobber.com/api/oauth/authorize";
export const JOBBER_GRAPHQL_URL = "https://api.getjobber.com/api/graphql";
// Jobber requires this on every GraphQL call, not just the auth token —
// pins which version of their schema you're targeting. If Jobber
// deprecates this dated version, requests will start failing with a clear
// version error; bump the string here when that happens.
const JOBBER_API_VERSION = "2025-04-16";

export function jobberRedirectUri(): string {
  // Must exactly match the Redirect URI entered when the app was created in
  // Jobber's Developer Center.
  //
  // The APP origin, not the storefront's: connecting Jobber is something a
  // contractor does inside their own application, and a homeowner must never
  // be sent there. It previously came from NEXT_PUBLIC_SITE_URL, one variable
  // shared with customer-facing links — which worked only while both lived on
  // one hostname.
  //
  // Falls back to the deployment's own origin rather than a hardcoded host.
  // The old fallback named bookeliteelectric.vercel.app, so a misconfigured
  // deployment sent contractors to a DIFFERENT DEPLOYMENT'S callback.
  const origin = appOrigin();
  if (!origin) {
    throw new Error(
      "No application origin is configured. Set APP_ORIGIN (or BETTER_AUTH_URL) " +
        "so the Jobber callback points at this deployment — a guessed host would " +
        "send the contractor somewhere else entirely."
    );
  }
  return `${origin}/api/admin/jobber/callback`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.JOBBER_CLIENT_ID ?? "",
      client_secret: process.env.JOBBER_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
      code,
      redirect_uri: jobberRedirectUri(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Jobber token exchange failed: ${await res.text()}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

async function refreshTokens(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.JOBBER_CLIENT_ID ?? "",
      client_secret: process.env.JOBBER_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Jobber token refresh failed: ${await res.text()}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

export async function saveJobberTokens(
  tokens: { access_token: string; refresh_token: string; expires_in: number },
  // Which contractor just connected their Jobber account. Passed in rather
  // than resolved here: this runs on the unguarded client by classification
  // (OAuth, outside any request tenant context), so nothing stamps the owner,
  // and contract made the column required.
  //
  contractorId: string
) {
  // KEYED ON THE CONTRACTOR, via the @unique on contractorId that already
  // enforces one connection per contractor at the database level.
  //
  // This used to upsert on `id: "default"`. Because `id` also defaulted to
  // the literal "default", every connection was the same row: a second
  // contractor completing OAuth would MATCH the first contractor's row and
  // update it, writing their tokens over the first contractor's while
  // contractorId still said the first contractor. Their subsequent Jobber
  // calls would then act on the other business's account.
  await prisma.jobberConnection.upsert({
    where: { contractorId },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
    create: {
      contractorId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
}

// Always call this before making a Jobber API request — it transparently
// refreshes an expired access token so nothing else has to think about it.
//
// Jobber's refresh tokens are single-use: using one invalidates it and
// issues a new one. If two requests both try to refresh at nearly the
// same moment, this guards against the race where the second one reads
// the token before the first one's replacement is saved — a
// compare-and-swap on the write (only update if the refresh token is
// still what we read), plus a fallback that checks whether someone else
// already won the race before treating a refresh failure as real.
export async function getValidJobberAccessToken(contractorId: string): Promise<string | null> {
  const conn = await prisma.jobberConnection.findUnique({ where: { contractorId } });
  if (!conn) return null;

  if (conn.expiresAt.getTime() > Date.now() + 2 * 60 * 1000) {
    return conn.accessToken;
  }

  try {
    const fresh = await refreshTokens(conn.refreshToken);

    const updateResult = await prisma.jobberConnection.updateMany({
      where: { contractorId, refreshToken: conn.refreshToken }, // only if unchanged since we read it
      data: {
        accessToken: fresh.access_token,
        refreshToken: fresh.refresh_token,
        expiresAt: new Date(Date.now() + fresh.expires_in * 1000),
      },
    });

    if (updateResult.count === 0) {
      // Someone else already refreshed first between our read and our
      // write. Our own refresh call above may have succeeded at Jobber's
      // end too — wasteful, but not harmful — just use whatever the
      // winner actually persisted instead of our now-orphaned copy.
      const latest = await prisma.jobberConnection.findUnique({ where: { contractorId } });
      return latest?.accessToken ?? fresh.access_token;
    }

    return fresh.access_token;
  } catch (err) {
    // Our own refresh attempt failed — possibly because a concurrent
    // request already consumed this exact refresh token first. Check
    // whether the connection was actually updated successfully by
    // someone else in the meantime before treating this as a real,
    // connection-breaking failure.
    const latest = await prisma.jobberConnection.findUnique({ where: { contractorId } });
    if (latest && latest.expiresAt.getTime() > Date.now()) {
      return latest.accessToken;
    }
    throw err;
  }
}

// Low-level GraphQL request — handles auth header, version header, and
// surfaces BOTH transport errors (bad request, network) and GraphQL-level
// errors (including Jobber's own `userErrors` validation array) so the
// caller always knows exactly what happened rather than a silent failure.
export async function jobberGraphQL<T = any>(
  // FIRST and required, deliberately. Every Jobber request acts on exactly
  // one contractor's account with that contractor's tokens; making this the
  // leading argument means a call site cannot omit it and silently inherit
  // whichever connection happened to be found first.
  contractorId: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const accessToken = await getValidJobberAccessToken(contractorId);
  if (!accessToken) {
    throw new Error("Jobber isn't connected — visit /admin/jobber to connect it first.");
  }

  const res = await fetch(JOBBER_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-JOBBER-GRAPHQL-VERSION": JOBBER_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await res.json();

  if (!res.ok || body.errors) {
    throw new Error(`Jobber API error: ${JSON.stringify(body.errors ?? body)}`);
  }

  return body.data as T;
}

const CLIENT_CREATE_MUTATION = `
  mutation CreateClient($input: ClientCreateInput!) {
    clientCreate(input: $input) {
      client { id firstName lastName }
      userErrors { message path }
    }
  }
`;

// Mutation name and argument shape INFERRED from Jobber's consistent
// naming convention (ClientCreateInput -> clientCreate, JobCreateInput ->
// jobCreate), not independently confirmed via the schema explorer like
// everything else here. If pushing a booking fails specifically at this
// step, this is the first thing to re-verify.
const PROPERTY_CREATE_MUTATION = `
  mutation CreateProperty($clientId: EncodedId!, $input: PropertyCreateInput!) {
    propertyCreate(clientId: $clientId, input: $input) {
      properties { id }
      userErrors { message path }
    }
  }
`;

const JOB_CREATE_MUTATION = `
  mutation CreateJob($input: JobCreateAttributes!) {
    jobCreate(input: $input) {
      job { id jobNumber title }
      userErrors { message path }
    }
  }
`;

// Splits "Joshua Hall" into firstName/lastName the way Jobber's Client
// object expects — Jobber has no single "full name" field on create.
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? fullName,
    lastName: parts.slice(1).join(" ") || "-", // Jobber requires a lastName; "-" if none given
  };
}

// Pushes a completed Booking into Jobber as a new Client + Property + Job,
// with a specific crew auto-assigned (see pickCrewForWindow) — never a
// customer choice. Always creates a NEW client rather than searching for
// an existing one by email first — a reasonable v1 simplification, but
// worth knowing: a repeat customer will currently get a duplicate client
// record in Jobber rather than being matched to their existing one.
export async function pushBookingToJobber(
  // Whose Jobber account this job goes into. Paired with the guarded client
  // below: the booking is read as this contractor AND written to this
  // contractor's Jobber, so the two can never disagree.
  contractorId: string,
  // The GUARDED client, passed in rather than reached for. This function runs
  // from two places — checkout and the admin "Send to Jobber" action — and
  // both already hold one. Taking it as the first parameter means the booking
  // read below is scoped to the contractor whose Jobber account we are about
  // to write into, which is the pairing that matters: pushing one
  // contractor's job into another's Jobber is not a leak, it dispatches the
  // wrong crew to a real address.
  db: PrismaClient,
  bookingId: string,
  preSelectedCrewId?: string
): Promise<{ jobberJobId: string; jobNumber: number }> {
  const booking = await db.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      customer: true,
      arrivalWindow: true,
      visit: { include: { lineItems: { include: { service: { select: { name: true } } } } } },
    },
  });

  const { firstName, lastName } = splitName(booking.customer.name ?? "Customer");

  const clientResult = await jobberGraphQL<{
    clientCreate: { client: { id: string } | null; userErrors: { message: string; path: string[] }[] };
  }>(contractorId, CLIENT_CREATE_MUTATION, {
    input: {
      firstName,
      lastName,
      emails: booking.customer.email ? [{ description: "MAIN", primary: true, address: booking.customer.email }] : [],
      phones: booking.customer.phone ? [{ description: "MAIN", primary: true, number: booking.customer.phone }] : [],
    },
  });

  if (clientResult.clientCreate.userErrors.length > 0 || !clientResult.clientCreate.client) {
    throw new Error(`Jobber rejected the client: ${JSON.stringify(clientResult.clientCreate.userErrors)}`);
  }
  const jobberClientId = clientResult.clientCreate.client.id;

  // Our own checkout form only ever collected one freeform address line
  // plus a zip code — never separate street/city/state fields the way
  // Jobber's AddressAttributes wants. Reasonable simplification: the
  // whole address string goes in street1, and province/country are
  // hardcoded since the whole service area is NJ. Flagging this as a
  // real simplification, not an oversight.
  const propertyResult = await jobberGraphQL<{
    propertyCreate: { properties: { id: string }[] | null; userErrors: { message: string; path: string[] }[] };
  }>(contractorId, PROPERTY_CREATE_MUTATION, {
    clientId: jobberClientId,
    input: {
      properties: [
        {
          address: {
            street1: booking.address,
            city: "",
            province: "NJ",
            country: "US",
            postalCode: booking.zipCode,
          },
        },
      ],
    },
  });

  if (propertyResult.propertyCreate.userErrors.length > 0 || !propertyResult.propertyCreate.properties?.[0]) {
    throw new Error(`Jobber rejected the property: ${JSON.stringify(propertyResult.propertyCreate.userErrors)}`);
  }
  const jobberPropertyId = propertyResult.propertyCreate.properties[0].id;

  const primaryItem = booking.visit.lineItems.find((li) => li.isPrimary);
  const title = primaryItem?.service.name ?? "Service Visit";

  const lineItemSummary = booking.visit.lineItems
    .map((li) => `${li.isPrimary ? "" : "+ "}${li.service.name}`)
    .join("\n");

  const dateStr = booking.arrivalWindow.date.toISOString().split("T")[0];

  // scheduling.startTime/endTime are wall-clock ISO8601Time (no date, no
  // timezone) — Jobber interprets these against the account's own
  // configured timezone, so this is deliberately the raw Eastern time
  // the customer picked, not a UTC conversion (unlike the availability-
  // check code elsewhere in this file, which genuinely needs real UTC
  // instants for comparison).
  const [startH, startM] = to24Hour(booking.arrivalWindow.startTime).split(":").map(Number);
  const [rawEndH, rawEndM] = to24Hour(booking.arrivalWindow.endTime).split(":").map(Number);
  const startTime = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}:00`;

  // The arrival WINDOW (customer-facing "someone will arrive between
  // 2-5pm") stays the raw 3-hour promise — arrivalWindow.durationInMinutes
  // below uses this. But the JOB's own scheduled end time — how long the
  // crew's calendar actually shows them busy — reflects the real
  // estimated job length when it's longer than the window itself, so a
  // long job doesn't just quietly vanish from the calendar after 3 hours.
  const rawWindowMinutes = (rawEndH * 60 + rawEndM) - (startH * 60 + startM);
  const realDurationMinutes = Math.max(rawWindowMinutes, booking.estimatedDurationMinutes ?? rawWindowMinutes);
  const realEndTotalMinutes = startH * 60 + startM + realDurationMinutes;
  const endTime = `${String(Math.floor(realEndTotalMinutes / 60)).padStart(2, "0")}:${String(realEndTotalMinutes % 60).padStart(2, "0")}:00`;

  // Automatic crew assignment — never shown to or chosen by the customer.
  // Skipped entirely if the caller already determined this (checkout does
  // its own availability check before creating the booking at all, and
  // passes that same result through here — avoiding a second, redundant
  // Jobber lookup for the same window).
  let assignedCrewId = preSelectedCrewId ?? null;
  let eligibleCrews: { jobberUserId: string }[] = [];

  if (!assignedCrewId) {
    // Guarded: this contractor's crew decides this contractor's assignment.
    eligibleCrews = await db.jobberCrewMember.findMany({
      where: { eligibleForWebsiteBookings: true },
      select: { jobberUserId: true },
    });
    const [windowStartDate, windowEndDate] = effectiveBusySpan(
      dateStr,
      booking.arrivalWindow.startTime,
      booking.arrivalWindow.endTime,
      booking.estimatedDurationMinutes
    );
    assignedCrewId = await pickCrewForWindow(
      contractorId,
      dateStr,
      windowStartDate,
      windowEndDate,
      eligibleCrews.map((c) => c.jobberUserId)
    );
  }

  if (!assignedCrewId) {
    throw new Error(
      `No eligible crew was actually free for ${dateStr} ${startTime}-${endTime}. ` +
      `Eligible crews checked: [${eligibleCrews.map((c) => c.jobberUserId).join(", ")}]. ` +
      `If this list is empty, no crews are marked eligible in /admin/jobber/crews. ` +
      `If it's non-empty, check Jobber directly for what's actually scheduled on each of ` +
      `those users for this window — including all-day visits, which block the whole day.`
    );
  }

  const jobResult = await jobberGraphQL<{
    jobCreate: { job: { id: string; jobNumber: number } | null; userErrors: { message: string; path: string[] }[] };
  }>(contractorId, JOB_CREATE_MUTATION, {
    input: {
      propertyId: jobberPropertyId,
      title,
      instructions: `${lineItemSummary}\n\nTotal: ${formatDollars(booking.totalCents)}\nBooked via Price2Book`,
      timeframe: {
        startAt: dateStr,
        durationUnits: "DAYS",
        durationValue: 1,
      },
      scheduling: {
        createVisits: true,
        notifyTeam: true,
        assignedTo: [assignedCrewId],
        startTime,
        endTime,
      },
      invoicing: {
        // Payment already happened through our own Stripe checkout —
        // Jobber should never generate its own invoice for this job.
        invoicingType: "FIXED_PRICE",
        invoicingSchedule: "NEVER",
      },
      arrivalWindow: {
        durationInMinutes: Math.round(rawWindowMinutes),
      },
    },
  });

  if (jobResult.jobCreate.userErrors.length > 0 || !jobResult.jobCreate.job) {
    throw new Error(`Jobber rejected the job: ${JSON.stringify(jobResult.jobCreate.userErrors)}`);
  }

  return { jobberJobId: jobResult.jobCreate.job.id, jobNumber: jobResult.jobCreate.job.jobNumber };
}

// "8:00 AM" -> "08:00", "5:00 PM" -> "17:00" — our windows are stored as
// display strings; Jobber's timestamps need 24-hour time.
function to24Hour(display: string): string {
  const [time, meridiem] = display.split(" ");
  let [hours, minutes] = time.split(":").map(Number);
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const USERS_QUERY = `
  query ListUsers {
    users(first: 50) {
      nodes {
        id
        name { full }
      }
    }
  }
`;

// Pulls the real list of users/crews from Jobber. Used to populate the
// crew-eligibility admin screen — Jobber doesn't distinguish "electrician
// crew" from "carpenter" for us, a human has to mark that here.
export async function fetchJobberUsers(contractorId: string): Promise<{ id: string; name: string }[]> {
  const result = await jobberGraphQL<{ users: { nodes: { id: string; name: { full: string } }[] } }>(contractorId, USERS_QUERY);
  return result.users.nodes.map((u) => ({ id: u.id, name: u.name.full }));
}

const VISITS_FOR_DAY_QUERY = `
  query VisitsForDay($after: ISO8601DateTime!, $before: ISO8601DateTime!) {
    visits(filter: { startAt: { after: $after, before: $before } }, first: 100) {
      nodes {
        id
        startAt
        endAt
        allDay
        assignedUsers(first: 10) {
          nodes { id }
        }
      }
    }
  }
`;

type JobberVisit = { id: string; startAt: string | null; endAt: string | null; allDay: boolean; assignedUserIds: string[] };

// Pulls every real Jobber visit scheduled anywhere in the given calendar
// day — deliberately broad (whole day, not just the candidate window) so
// overlap can be computed precisely in application code below, rather
// than trusting a single-field filter to catch every edge case (e.g. a
// visit that started before the candidate window but runs into it).
async function fetchJobberVisitsForDay(contractorId: string, dateISO: string): Promise<JobberVisit[]> {
  // LOCAL DEVELOPMENT ONLY. Jobber's OAuth credentials are per-application and
  // a developer machine usually has none that work, so every checkout 500s on
  // a scheduling call that has nothing to do with what is being tested.
  //
  // Deliberately double-gated — the flag alone is not enough, it must also not
  // be a production build — because "pretend the calendar is empty" is exactly
  // the assumption that double-books a crew if it ever escaped.
  if (process.env.NODE_ENV !== "production" && process.env.JOBBER_LOCAL_STUB === "1") {
    return [];
  }

  // Midnight-to-midnight in Eastern time, not UTC — a visit at 11pm
  // Eastern is already the next UTC calendar day, and a naive UTC-day
  // boundary would misattribute or miss it entirely.
  const dayStart = zonedWallTimeToUtc(dateISO, 0, 0).toISOString();
  const dayEnd = zonedWallTimeToUtc(dateISO, 23, 59).toISOString();

  const result = await jobberGraphQL<{ visits: { nodes: { id: string; startAt: string | null; endAt: string | null; allDay: boolean; assignedUsers: { nodes: { id: string }[] } }[] } }>(
    contractorId,
    VISITS_FOR_DAY_QUERY,
    { after: dayStart, before: dayEnd }
  );

  return result.visits.nodes.map((v) => ({
    id: v.id,
    startAt: v.startAt,
    endAt: v.endAt,
    allDay: v.allDay,
    assignedUserIds: v.assignedUsers.nodes.map((u) => u.id),
  }));
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// The actual "is anyone free" check. Returns how many ELIGIBLE crews
// (per /admin/jobber/crews) have no real Jobber visit overlapping the
// candidate window — 0 means fully booked, don't offer this window.
// Deliberately checks true time overlap, not just same-day, so a crew
// tied up 7am-11am correctly blocks a 10am-1pm candidate window even
// though neither startAt matches the other's range filter directly.
export async function countAvailableCrewsForWindow(
  contractorId: string,
  dateISO: string,
  windowStart: Date,
  windowEnd: Date,
  eligibleJobberUserIds: string[]
): Promise<number> {
  if (eligibleJobberUserIds.length === 0) return 0;

  const dayVisits = await fetchJobberVisitsForDay(contractorId, dateISO);

  const busyUserIds = new Set<string>();
  for (const visit of dayVisits) {
    if (!visit.startAt || !visit.endAt) continue; // unscheduled visit, doesn't block anything
    const vStart = new Date(visit.startAt);
    const vEnd = new Date(visit.endAt);
    if (rangesOverlap(windowStart, windowEnd, vStart, vEnd)) {
      for (const userId of visit.assignedUserIds) busyUserIds.add(userId);
    }
  }

  const freeCount = eligibleJobberUserIds.filter((id) => !busyUserIds.has(id)).length;
  return freeCount;
}

// All arrival windows and Jobber visit comparisons need to happen in
// Elite's actual service-area timezone, not whatever timezone the server
// happens to run in. Vercel's servers run in UTC — without this, "8:00
// AM" was silently being treated as 8am UTC (4am Eastern), which meant
// real Eastern-time Jobber visits weren't lining up with the windows
// being checked against them at all.
const SERVICE_AREA_TIMEZONE = "America/New_York";

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
  return (asUTC - date.getTime()) / 60000;
}

// Converts a wall-clock date + time that's meant in SERVICE_AREA_TIMEZONE
// into the correct real UTC instant — correctly DST-aware (EST vs EDT)
// via the ICU timezone database Node ships with, no extra dependency needed.
function zonedWallTimeToUtc(dateISO: string, hours: number, minutes: number): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  const naiveUtcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  const offsetMinutes = getTimeZoneOffsetMinutes(naiveUtcGuess, SERVICE_AREA_TIMEZONE);
  return new Date(naiveUtcGuess.getTime() - offsetMinutes * 60000);
}

// Fallback only. The real windows are generated from BusinessHours — see
// lib/businessHours.ts — and these are what you get if that record is missing
// or unreadable. They match the defaults, so behavior is unchanged rather
// than absent.
export const FIXED_ARRIVAL_WINDOWS = [
  { start: "8:00 AM", end: "11:00 AM" },
  { start: "11:00 AM", end: "2:00 PM" },
  { start: "2:00 PM", end: "4:30 PM" },
];

export function windowToDateRange(dateISO: string, startDisplay: string, endDisplay: string): [Date, Date] {
  const [startH, startM] = to24Hour(startDisplay).split(":").map(Number);
  const [endH, endM] = to24Hour(endDisplay).split(":").map(Number);
  return [
    zonedWallTimeToUtc(dateISO, startH, startM),
    zonedWallTimeToUtc(dateISO, endH, endM),
  ];
}

// The arrival WINDOW shown to a customer ("someone will arrive between
// 2-5pm") is a separate promise from how long the job actually takes once
// they arrive. This computes the REAL span a crew should be considered
// busy for: starts at the window's start (assumed earliest arrival), but
// extends past the window's own end if the job is estimated to run
// longer than the window itself — so a long job correctly blocks a
// crew's calendar for its real length, not just the 3-hour arrival
// promise. A short job (shorter than the window) just uses the window
// as-is, unchanged from before.
export function effectiveBusySpan(
  dateISO: string,
  windowStartDisplay: string,
  windowEndDisplay: string,
  estimatedDurationMinutes: number | null | undefined
): [Date, Date] {
  const [windowStart, windowEnd] = windowToDateRange(dateISO, windowStartDisplay, windowEndDisplay);
  if (!estimatedDurationMinutes) return [windowStart, windowEnd];

  const durationBasedEnd = new Date(windowStart.getTime() + estimatedDurationMinutes * 60000);
  const effectiveEnd = durationBasedEnd.getTime() > windowEnd.getTime() ? durationBasedEnd : windowEnd;
  return [windowStart, effectiveEnd];
}

// Crews shouldn't be scheduled to work past 4:30pm — a job long enough to
// run past that, even starting at the earliest possible arrival, isn't
// offered at all rather than risking someone still on-site well after
// their shift should have ended.
// Exported because checkout enforces the same cutoff — the schedule page
// decides what to SHOW, checkout decides what's allowed, and they have to
// agree. One constant, two callers.
//
// POLICY[workday.end]: 16:30
// POLICY[workday.days]: MON_TO_FRI
//
// Both belong in configuration rather than here: a contractor who works
// Saturdays, or until 6pm, needs to change this without a deploy. The
// verification lead-time rule needs the same working-days list.
export const WORKDAY_END_DISPLAY = "4:30 PM";

// Checks all 4 fixed windows for one calendar day against ONE fetch of
// that day's real Jobber visits — not 4 separate fetches. Deliberately
// "fails open" (treats every window as available) if there are no
// eligible crews configured yet, or if the Jobber call itself errors —
// a broken/unconfigured integration should never be able to take down
// the ability to book a job entirely. Errors are logged server-side so
// the problem is still visible to whoever's watching logs.
export async function getWindowAvailabilityForDay(
  contractorId: string,
  dateISO: string,
  eligibleJobberUserIds: string[],
  estimatedDurationMinutes?: number | null,
  /**
   * The day's windows and closing time, from BusinessHours.
   *
   * Passed in rather than read here, so this module stays about Jobber and
   * doesn't acquire its own opinion about when Elite works. Omitted, it falls
   * back to the constants above.
   */
  schedule?: { windows: { start: string; end: string }[]; dayEndDisplay: string }
): Promise<{ start: string; end: string; available: boolean }[]> {
  const windows = schedule?.windows?.length ? schedule.windows : FIXED_ARRIVAL_WINDOWS;
  const dayEnd = schedule?.dayEndDisplay ?? WORKDAY_END_DISPLAY;
  const [, workdayEnd] = windowToDateRange(dateISO, "8:00 AM", dayEnd);

  /**
   * Does the job fit before the crew's day ends, starting at this window?
   *
   * Applied on EVERY path, including the fail-open ones below. Those used to
   * return every window as available, which quietly bypassed this — so with
   * Jobber down, a seven-hour job could be booked at 2pm and the crew would
   * be on site until nine.
   *
   * Failing open on JOBBER is right: a broken integration shouldn't stop
   * anyone booking. But the 4:30 cutoff isn't Jobber's data, it's when Elite's
   * crews go home. Nothing about an API outage makes a nine-hour afternoon
   * acceptable.
   */
  const fitsInTheDay = (w: { start: string; end: string }) => {
    const [, effectiveEnd] = effectiveBusySpan(dateISO, w.start, w.end, estimatedDurationMinutes);
    return effectiveEnd.getTime() <= workdayEnd.getTime();
  };

  if (eligibleJobberUserIds.length === 0) {
    return windows.map((w) => ({ ...w, available: fitsInTheDay(w) }));
  }

  let dayVisits: JobberVisit[];
  try {
    dayVisits = await fetchJobberVisitsForDay(contractorId, dateISO);
  } catch (err) {
    console.error(`Jobber availability check failed for ${dateISO}, failing open:`, err);
    return windows.map((w) => ({ ...w, available: fitsInTheDay(w) }));
  }

  return windows.map((w) => {
    const [windowStart, effectiveEnd] = effectiveBusySpan(dateISO, w.start, w.end, estimatedDurationMinutes);

    // Too long to fit even starting at this window's earliest arrival —
    // not offered, regardless of who's free.
    if (!fitsInTheDay(w)) {
      return { start: w.start, end: w.end, available: false };
    }

    const busyUserIds = new Set<string>();
    for (const visit of dayVisits) {
      // All-day visits block the entire day regardless of window, and
      // regardless of whether startAt/endAt happen to be populated —
      // allDay is the authoritative signal here, not a time comparison
      // that might behave unexpectedly for a visit with no specific hours.
      if (visit.allDay) {
        visit.assignedUserIds.forEach((id) => busyUserIds.add(id));
        continue;
      }
      if (!visit.startAt || !visit.endAt) continue; // genuinely unscheduled, doesn't block anything
      if (rangesOverlap(windowStart, effectiveEnd, new Date(visit.startAt), new Date(visit.endAt))) {
        visit.assignedUserIds.forEach((id) => busyUserIds.add(id));
      }
    }
    const freeCount = eligibleJobberUserIds.filter((id) => !busyUserIds.has(id)).length;
    return { start: w.start, end: w.end, available: freeCount > 0 };
  });
}

// Picks WHICH eligible, available crew to assign a job to — deliberately
// automatic, never shown to the customer. Among everyone actually free
// for this window, assigns whichever has the fewest scheduled minutes
// already that day (simple load balancing), not just "first in the
// list" — otherwise whoever happens to sync first would get overloaded.
// Returns null if nobody's actually free (shouldn't happen if the
// availability check already confirmed this window as bookable, but
// checked explicitly rather than assumed).
export async function pickCrewForWindow(
  contractorId: string,
  dateISO: string,
  windowStart: Date,
  windowEnd: Date,
  eligibleJobberUserIds: string[]
): Promise<string | null> {
  if (eligibleJobberUserIds.length === 0) return null;

  const dayVisits = await fetchJobberVisitsForDay(contractorId, dateISO);

  const busyUserIds = new Set<string>();
  const scheduledMinutesByUser = new Map<string, number>();
  for (const id of eligibleJobberUserIds) scheduledMinutesByUser.set(id, 0);

  for (const visit of dayVisits) {
    const duration = visit.allDay
      ? 24 * 60
      : visit.startAt && visit.endAt
      ? (new Date(visit.endAt).getTime() - new Date(visit.startAt).getTime()) / 60000
      : 0;

    for (const userId of visit.assignedUserIds) {
      if (scheduledMinutesByUser.has(userId)) {
        scheduledMinutesByUser.set(userId, (scheduledMinutesByUser.get(userId) ?? 0) + duration);
      }
    }

    if (visit.allDay) {
      visit.assignedUserIds.forEach((id) => busyUserIds.add(id));
      continue;
    }
    if (!visit.startAt || !visit.endAt) continue;
    if (rangesOverlap(windowStart, windowEnd, new Date(visit.startAt), new Date(visit.endAt))) {
      visit.assignedUserIds.forEach((id) => busyUserIds.add(id));
    }
  }

  const freeCrews = eligibleJobberUserIds.filter((id) => !busyUserIds.has(id));
  if (freeCrews.length === 0) return null;

  freeCrews.sort((a, b) => (scheduledMinutesByUser.get(a) ?? 0) - (scheduledMinutesByUser.get(b) ?? 0));
  return freeCrews[0];
}
