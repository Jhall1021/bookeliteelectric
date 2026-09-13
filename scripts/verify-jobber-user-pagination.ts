/**
 * Jobber crew sync must reconcile against a COMPLETE user roster.
 *
 *   npx tsx scripts/verify-jobber-user-pagination.ts
 *
 * The sync route is destructive in one important way: after a successful
 * provider read it removes cached crew members who no longer exist in Jobber.
 * That makes pagination correctness part of data safety. A partial first page
 * must never be mistaken for the whole roster.
 *
 * These checks exercise the injected page-request seam in lib/jobberUsers.ts;
 * they need no database, OAuth credentials, network access, or environment
 * configuration.
 */

import {
  fetchAllJobberUsers,
  type JobberUserPage,
  type JobberUserPageRequester,
} from "../lib/jobberUsers";

let failures = 0;

function ok(label: string, condition: boolean, detail?: string) {
  if (!condition) failures += 1;
  console.log(`  ${condition ? "✓" : "✗"} ${label}${condition || !detail ? "" : `  (${detail})`}`);
}

async function rejects(label: string, run: () => Promise<unknown>, pattern: RegExp) {
  let error: unknown;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  const message = error instanceof Error ? error.message : String(error ?? "no error");
  ok(label, error instanceof Error && pattern.test(message), message);
}

function page(
  nodes: Array<{ id: string; name: string }>,
  hasNextPage: boolean,
  endCursor: string | null
): JobberUserPage {
  return {
    nodes: nodes.map((user) => ({ id: user.id, name: { full: user.name } })),
    pageInfo: { hasNextPage, endCursor },
  };
}

async function main() {
  console.log("\nJOBBER USER PAGINATION — complete roster or no reconciliation\n");

  const requestedCursors: Array<string | null> = [];
  const pages = new Map<string, JobberUserPage>([
    ["FIRST", page([{ id: "usr-1", name: "Alex" }], true, "cursor-1")],
    ["cursor-1", page([{ id: "usr-2", name: "Jordan" }], false, null)],
  ]);
  const requestTwoPages: JobberUserPageRequester = async (after) => {
    requestedCursors.push(after);
    const result = pages.get(after ?? "FIRST");
    if (!result) throw new Error(`Unexpected cursor ${after}`);
    return result;
  };

  const users = await fetchAllJobberUsers("contractor-fixture", { requestPage: requestTwoPages });
  ok("1. all pages are combined into one roster", users.length === 2, `${users.length} users`);
  ok(
    "   the provider cursor advances to the next page",
    requestedCursors.length === 2 && requestedCursors[0] === null && requestedCursors[1] === "cursor-1",
    JSON.stringify(requestedCursors)
  );
  ok(
    "   user identity and names survive pagination",
    users[0]?.id === "usr-1" && users[0]?.name === "Alex" && users[1]?.id === "usr-2" && users[1]?.name === "Jordan"
  );

  await rejects(
    "2. hasNextPage without an end cursor is rejected",
    () => fetchAllJobberUsers("contractor-fixture", {
      requestPage: async () => page([{ id: "usr-1", name: "Alex" }], true, null),
    }),
    /pagination did not advance/i
  );

  let repeatCall = 0;
  await rejects(
    "3. an immediately repeated cursor cannot certify a partial roster",
    () => fetchAllJobberUsers("contractor-fixture", {
      requestPage: async () => {
        repeatCall += 1;
        return repeatCall === 1
          ? page([{ id: "usr-1", name: "Alex" }], true, "same-cursor")
          : page([{ id: "usr-2", name: "Jordan" }], true, "same-cursor");
      },
    }),
    /pagination did not advance/i
  );

  let cycleCall = 0;
  await rejects(
    "4. a longer cursor cycle is rejected before it can loop",
    () => fetchAllJobberUsers("contractor-fixture", {
      requestPage: async () => {
        cycleCall += 1;
        if (cycleCall === 1) return page([{ id: "usr-1", name: "Alex" }], true, "cursor-a");
        if (cycleCall === 2) return page([{ id: "usr-2", name: "Jordan" }], true, "cursor-b");
        return page([{ id: "usr-3", name: "Casey" }], true, "cursor-a");
      },
    }),
    /pagination did not advance/i
  );

  let duplicateCall = 0;
  await rejects(
    "5. duplicate user IDs across pages are rejected",
    () => fetchAllJobberUsers("contractor-fixture", {
      requestPage: async () => {
        duplicateCall += 1;
        return duplicateCall === 1
          ? page([{ id: "usr-1", name: "Alex" }], true, "cursor-1")
          : page([{ id: "usr-1", name: "Alex again" }], false, null);
      },
    }),
    /duplicate user usr-1/i
  );

  await rejects(
    "6. an incomplete provider record cannot enter the roster",
    () => fetchAllJobberUsers("contractor-fixture", {
      requestPage: async () => ({
        nodes: [{ id: "", name: { full: "Alex" } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      }),
    }),
    /invalid user record/i
  );

  let endlessPage = 0;
  await rejects(
    "7. an implausibly deep roster stops instead of reconciling partial data",
    () => fetchAllJobberUsers("contractor-fixture", {
      requestPage: async () => {
        endlessPage += 1;
        return page(
          [{ id: `usr-${endlessPage}`, name: `User ${endlessPage}` }],
          true,
          `cursor-${endlessPage}`
        );
      },
    }),
    /safety limit/i
  );

  console.log();
  console.log(
    failures
      ? `  ${failures} check(s) failed.\n`
      : "  Crew sync can only reconcile after a complete, advancing Jobber roster read.\n"
  );
  if (failures) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
