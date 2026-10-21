import assert from "node:assert/strict";

import { clearStairWalkDrafts, stairWalkDraftStorageKey } from "../lib/electrical/stairWalkDraft";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const storage = new MemoryStorage();
const questionId = "dedicated-route-question";
const firstSessionKey = stairWalkDraftStorageKey("session-one", questionId);
const secondSessionKey = stairWalkDraftStorageKey("session-two", questionId);

assert.notEqual(firstSessionKey, secondSessionKey, "a new guided-flow session cannot inherit the prior route draft");
storage.setItem(firstSessionKey, JSON.stringify({ panelPlace: "garage" }));
storage.setItem("unrelated-session-value", "keep me");

assert.equal(storage.getItem(firstSessionKey), storage.getItem(firstSessionKey), "Back in the same session reads the same remembered route");
assert.equal(storage.getItem(secondSessionKey), null, "a different guided-flow session starts without a remembered route");

clearStairWalkDrafts(storage);
assert.equal(storage.getItem(firstSessionKey), null, "opening a fresh flow or completing a visit clears old Stair Walk drafts");
assert.equal(storage.getItem("unrelated-session-value"), "keep me", "draft cleanup does not touch unrelated session data");

console.log("stair walk draft: Back is retained within one flow, while fresh and completed flows cannot inherit an old route");
