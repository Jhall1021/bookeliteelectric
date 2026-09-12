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

type JobberUserNode = {
  id: string;
  name: { full: string };
};

type JobberUsersPage = {
  users: {
    nodes: JobberUserNode[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
};

/**
 * Fetch the complete Jobber user roster using Jobber's Relay-style cursor
 * pagination. A crew sync is allowed to remove stale cached users only after
 * this function reaches an explicit `hasNextPage: false`; a partial list must
 * never become scheduling authority.
 */
export async function fetchAllJobberUsers(
  contractorId: string,
): Promise<{ id: string; name: string }[]> {
  const users: { id: string; name: string }[] = [];
  const seenIds = new Set<string>();
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result: JobberUsersPage = await jobberGraphQL<JobberUsersPage>(
      contractorId,
      USERS_PAGE_QUERY,
      { after },
    );

    const nodes = result.users?.nodes;
    const pageInfo = result.users?.pageInfo;
    if (!Array.isArray(nodes) || !pageInfo || typeof pageInfo.hasNextPage !== "boolean") {
      throw new Error("Jobber returned an incomplete users page.");
    }

    for (const node of nodes) {
      const id = typeof node?.id === "string" ? node.id.trim() : "";
      const name = typeof node?.name?.full === "string" ? node.name.full.trim() : "";
      if (!id || !name || seenIds.has(id)) {
        throw new Error("Jobber returned an invalid or duplicate user in the crew roster.");
      }
      seenIds.add(id);
      users.push({ id, name });
    }

    if (!pageInfo.hasNextPage) return users;

    const nextCursor = typeof pageInfo.endCursor === "string" ? pageInfo.endCursor : "";
    if (!nextCursor || nextCursor === after) {
      throw new Error("Jobber pagination did not advance while more users were reported.");
    }
    after = nextCursor;

    // A full page is normal. A short page with hasNextPage=true is also valid;
    // pageInfo, not node count, is the authority for whether another request is
    // required.
    if (nodes.length > PAGE_SIZE) {
      throw new Error("Jobber returned more users than the requested page size.");
    }
  }

  throw new Error("Jobber crew pagination exceeded the safety limit before completion.");
}
