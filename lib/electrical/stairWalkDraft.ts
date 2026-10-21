const STAIR_WALK_DRAFT_PREFIX = "p2b:stair-walk:";

type StairWalkStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function stairWalkDraftStorageKey(scope: string, questionId: string): string {
  return `${STAIR_WALK_DRAFT_PREFIX}${scope}:${questionId}`;
}

/**
 * A Stair Walk draft exists only to make Back work inside the current guided
 * flow. Clear older drafts whenever a service flow is opened afresh or the
 * completed service is added to the visit, so a later visit cannot reopen a
 * route the customer already finished or abandoned.
 */
export function clearStairWalkDrafts(storage: StairWalkStorage): void {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(STAIR_WALK_DRAFT_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}
