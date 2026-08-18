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
  // Must exactly match the Redirect URI entered when the app was created
  // in Jobber's Developer Center.
  return `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://bookeliteelectric.vercel.app"}/api/admin/jobber/callback`;
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

export async function saveJobberTokens(tokens: { access_token: string; refresh_token: string; expires_in: number }) {
  await prisma.jobberConnection.upsert({
    where: { id: "default" },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
    create: {
      id: "default",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
}

// Always call this before making a Jobber API request — it transparently
// refreshes an expired access token so nothing else has to think about it.
export async function getValidJobberAccessToken(): Promise<string | null> {
  const conn = await prisma.jobberConnection.findUnique({ where: { id: "default" } });
  if (!conn) return null;

  // Refresh a bit early (2 min buffer) rather than right at the expiry instant.
  if (conn.expiresAt.getTime() > Date.now() + 2 * 60 * 1000) {
    return conn.accessToken;
  }

  const fresh = await refreshTokens(conn.refreshToken);
  await saveJobberTokens(fresh);
  return fresh.access_token;
}

// Low-level GraphQL request — handles auth header, version header, and
// surfaces BOTH transport errors (bad request, network) and GraphQL-level
// errors (including Jobber's own `userErrors` validation array) so the
// caller always knows exactly what happened rather than a silent failure.
export async function jobberGraphQL<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const accessToken = await getValidJobberAccessToken();
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

const JOB_CREATE_MUTATION = `
  mutation CreateJob($input: JobCreateInput!) {
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

// Pushes a completed Booking into Jobber as a new Client + Job. Always
// creates a NEW client rather than searching for an existing one by email
// first — a reasonable v1 simplification, but worth knowing: a repeat
// customer will currently get a duplicate client record in Jobber rather
// than being matched to their existing one. Flagging this as a known
// limitation rather than silently building matching logic that might not
// match how you actually want duplicates handled.
export async function pushBookingToJobber(bookingId: string): Promise<{ jobberJobId: string; jobNumber: number }> {
  const booking = await prisma.booking.findUniqueOrThrow({
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
  }>(CLIENT_CREATE_MUTATION, {
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

  const primaryItem = booking.visit.lineItems.find((li) => li.isPrimary);
  const title = primaryItem?.service.name ?? "Elite Electric Service Visit";

  const lineItemSummary = booking.visit.lineItems
    .map((li) => `${li.isPrimary ? "" : "+ "}${li.service.name}`)
    .join("\n");

  // Combine the arrival window's date + time strings into full ISO8601
  // datetimes — Jobber's startAt/endAt expect a real timestamp, not just
  // a date and a separate time-of-day string like our own schema uses.
  const dateStr = booking.arrivalWindow.date.toISOString().split("T")[0];
  // Correctly zoned to Eastern (see zonedWallTimeToUtc) — previously
  // built with no timezone awareness at all, meaning real pushed bookings
  // were landing on your Jobber calendar hours off from the arrival
  // window the customer actually picked.
  const [startH, startM] = to24Hour(booking.arrivalWindow.startTime).split(":").map(Number);
  const [endH, endM] = to24Hour(booking.arrivalWindow.endTime).split(":").map(Number);
  const startAt = zonedWallTimeToUtc(dateStr, startH, startM).toISOString();
  const endAt = zonedWallTimeToUtc(dateStr, endH, endM).toISOString();

  const jobResult = await jobberGraphQL<{
    jobCreate: { job: { id: string; jobNumber: number } | null; userErrors: { message: string; path: string[] }[] };
  }>(JOB_CREATE_MUTATION, {
    input: {
      clientId: jobberClientId,
      title,
      instructions: `${lineItemSummary}\n\nTotal: ${formatDollars(booking.totalCents)}\nAddress: ${booking.address} ${booking.zipCode}\nBooked via BookEliteElectric.com`,
      startAt,
      endAt,
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
export async function fetchJobberUsers(): Promise<{ id: string; name: string }[]> {
  const result = await jobberGraphQL<{ users: { nodes: { id: string; name: { full: string } }[] } }>(USERS_QUERY);
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
async function fetchJobberVisitsForDay(dateISO: string): Promise<JobberVisit[]> {
  // Midnight-to-midnight in Eastern time, not UTC — a visit at 11pm
  // Eastern is already the next UTC calendar day, and a naive UTC-day
  // boundary would misattribute or miss it entirely.
  const dayStart = zonedWallTimeToUtc(dateISO, 0, 0).toISOString();
  const dayEnd = zonedWallTimeToUtc(dateISO, 23, 59).toISOString();

  const result = await jobberGraphQL<{ visits: { nodes: { id: string; startAt: string | null; endAt: string | null; allDay: boolean; assignedUsers: { nodes: { id: string }[] } }[] } }>(
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
  dateISO: string,
  windowStart: Date,
  windowEnd: Date,
  eligibleJobberUserIds: string[]
): Promise<number> {
  if (eligibleJobberUserIds.length === 0) return 0;

  const dayVisits = await fetchJobberVisitsForDay(dateISO);

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

export const FIXED_ARRIVAL_WINDOWS = [
  { start: "8:00 AM", end: "11:00 AM" },
  { start: "11:00 AM", end: "2:00 PM" },
  { start: "2:00 PM", end: "5:00 PM" },
  { start: "5:00 PM", end: "8:00 PM" },
];

function windowToDateRange(dateISO: string, startDisplay: string, endDisplay: string): [Date, Date] {
  const [startH, startM] = to24Hour(startDisplay).split(":").map(Number);
  const [endH, endM] = to24Hour(endDisplay).split(":").map(Number);
  return [
    zonedWallTimeToUtc(dateISO, startH, startM),
    zonedWallTimeToUtc(dateISO, endH, endM),
  ];
}

// Checks all 4 fixed windows for one calendar day against ONE fetch of
// that day's real Jobber visits — not 4 separate fetches. Deliberately
// "fails open" (treats every window as available) if there are no
// eligible crews configured yet, or if the Jobber call itself errors —
// a broken/unconfigured integration should never be able to take down
// the ability to book a job entirely. Errors are logged server-side so
// the problem is still visible to whoever's watching logs.
export async function getWindowAvailabilityForDay(
  dateISO: string,
  eligibleJobberUserIds: string[]
): Promise<{ start: string; end: string; available: boolean }[]> {
  if (eligibleJobberUserIds.length === 0) {
    return FIXED_ARRIVAL_WINDOWS.map((w) => ({ ...w, available: true }));
  }

  let dayVisits: JobberVisit[];
  try {
    dayVisits = await fetchJobberVisitsForDay(dateISO);
  } catch (err) {
    console.error(`Jobber availability check failed for ${dateISO}, failing open:`, err);
    return FIXED_ARRIVAL_WINDOWS.map((w) => ({ ...w, available: true }));
  }

  return FIXED_ARRIVAL_WINDOWS.map((w) => {
    const [windowStart, windowEnd] = windowToDateRange(dateISO, w.start, w.end);
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
      if (rangesOverlap(windowStart, windowEnd, new Date(visit.startAt), new Date(visit.endAt))) {
        visit.assignedUserIds.forEach((id) => busyUserIds.add(id));
      }
    }
    const freeCount = eligibleJobberUserIds.filter((id) => !busyUserIds.has(id)).length;
    return { start: w.start, end: w.end, available: freeCount > 0 };
  });
}
