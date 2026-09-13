import { jobberGraphQL } from "@/lib/jobber";

const PAGE_SIZE = 50;
const MAX_PAGES = 100;

const USERS_PAGE_QUERY = `
  query ListUsersPage($after: String) {
    users(first: 50, after: $after) {
      nodes {
        id
        name { full }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export type JobberUserNode = {
  id: string;
  name: { full: string };
};

export type JobberUserPage = {
  nodes: JobberUserNode[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
};

type JobberUsersResponse = {
  users: JobberUserPage;
};

export type JobberUserPageRequester = (
  after: string | null,
) => Promise<JobberUserPage>;

type FetchAllJobberUsersOptions = {
  requestPage?: JobberUserPageRequester;
};

async function requestJobberUserPage(
  contractorId: string,
  after: string | null,
): Promise<JobberUserPage> {
  const result = await jobberGraphQL<JobberUsersResponse>(
    contractorId,
    USERS_PAGE_QUERY,
    { after },
  );
  return result.users;
}

/**
 * Fetch the complete Jobber user roster using Jobber's Relay-style cursor
 * pagination. A crew sync is allowed to remove stale cached users only after
 * this function reaches an explicit `hasNextPage: false`; a partial list must
 * never become scheduling authority.
 *
 * `requestPage` is an injected provider seam used by deterministic verification
 * only. Production callers omit it and use the real Jobber GraphQL request.
 */
export async function fetchAllJobberUsers(
  contractorId: string,
  options: FetchAllJobberUsersOptions = {},
): Promise<{ id: string; name: string }[]> {
  const users: { id: string; name: string }[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  const requestPage = options.requestPage ?? ((after) => requestJobberUserPage(contractorId, after));
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await requestPage(after);
    const nodes = result?.nodes;
    const pageInfo = result?.pageInfo;

    if (!Array.isArray(nodes) || !pageInfo || typeof pageInfo.hasNextPage !== "boolean") {
      throw new Error("Jobber returned an incomplete users page.");
    }
    if (nodes.length > PAGE_SIZE) {
      throw new Error("Jobber returned more users than the requested page size.");
    }

    for (const node of nodes) {
      const id = typeof node?.id === "string" ? node.id.trim() : "";
      const name = typeof node?.name?.full === "string" ? node.name.full.trim() : "";
      if (!id || !name) {
        throw new Error("Jobber returned an invalid user record in the crew roster.");
      }
      if (seenIds.has(id)) {
        throw new Error(`Jobber returned duplicate user ${id} in the crew roster.`);
      }
      seenIds.add(id);
      users.push({ id, name });
    }

    if (!pageInfo.hasNextPage) return users;

    const nextCursor = typeof pageInfo.endCursor === "string" ? pageInfo.endCursor.trim() : "";
    if (!nextCursor || nextCursor === after || seenCursors.has(nextCursor)) {
      throw new Error("Jobber pagination did not advance while more users were reported.");
    }
    seenCursors.add(nextCursor);
    after = nextCursor;
  }

  throw new Error(
    `Jobber crew pagination exceeded the safety limit of ${MAX_PAGES} pages before completion.`,
  );
}
