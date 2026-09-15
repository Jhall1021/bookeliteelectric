import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`✓ ${name}`); }
function source(relative: string): string { return fs.readFileSync(path.join(process.cwd(), relative), "utf8"); }

const mediaApi = source("app/api/guided-flow-sessions/[id]/visual-assist-tasks/[taskId]/route-assist-media/route.ts");
const providerApi = source("app/api/guided-flow-sessions/[id]/visual-assist-tasks/[taskId]/route-assist-visible-scene/route.ts");
const persister = source("lib/visual-assist/route-assist/privateBrowserCapturePersister.ts");
const transport = source("lib/visual-assist/route-assist/browserVisibleSceneTransport.ts");
const smart = source("components/route-assist/RouteAssistSmartCapture.tsx");
const httpProvider = source("lib/visual-assist/route-assist/httpVisibleSceneProvider.ts");

check("private media upload is session and task scoped", () => {
  assert.match(mediaApi, /session\.sessionId !== sessionId/);
  assert.match(mediaApi, /taskType: "ROUTE_ASSIST"/);
  assert.match(mediaApi, /route-assist\/\$\{params\.id\}\/\$\{params\.taskId\}/);
  assert.doesNotMatch(mediaApi, /publicUrl|R2_PUBLIC_BASE_URL/);
});

check("semantic provider read access is private, short-lived and task scoped", () => {
  assert.match(providerApi, /binding\.mediaRef\.startsWith\(prefix\)/);
  assert.match(providerApi, /new GetObjectCommand/);
  assert.match(providerApi, /expiresIn: 300/);
  assert.match(providerApi, /ROUTE_ASSIST_VISIBLE_SCENE_PROVIDER_URL/);
  assert.match(providerApi, /parsedProviderUrl\.protocol !== "https:"/);
  assert.doesNotMatch(providerApi, /R2_PUBLIC_BASE_URL/);
});

check("browser transport sends opaque media references rather than storage read URLs", () => {
  assert.match(transport, /mediaRef/);
  assert.match(transport, /Route Assist primary evidence is not durably stored/);
  assert.doesNotMatch(transport, /getSignedUrl|GetObjectCommand|R2_PUBLIC_BASE_URL/);
});

check("capture persister keeps upload URL transient and returns opaque mediaRef", () => {
  assert.match(persister, /uploadUrl, mediaRef/);
  assert.match(persister, /URL\.createObjectURL\(blob\)/);
  assert.doesNotMatch(persister, /imageUrl: uploadUrl|publicUrl/);
});

check("homeowner endpoint taps are provider intent, not metric authority", () => {
  assert.match(httpProvider, /pointAnchors/);
  assert.match(httpProvider, /not metric geometry/);
  assert.match(httpProvider, /x: point\.x/);
  assert.match(httpProvider, /y: point\.y/);
});

check("ordinary browser smart flow never fabricates world geometry", () => {
  assert.match(smart, /ordinary browser cannot claim real-world feet/i);
  assert.match(smart, /Continue to measurement/);
  assert.match(smart, /expectedMode === "CONCEALED" \? "MANUAL"/);
  assert.doesNotMatch(smart, /WORLD_GEOMETRY/);
  assert.doesNotMatch(smart, /estimatedLengthFt\s*:/);
  assert.doesNotMatch(smart, /physicalTurn\s*:/);
});

check("real provider correction loop replaces fixture-only route revision in production flow", () => {
  assert.match(smart, /createRouteAssistHttpVisibleSceneProviderV1/);
  assert.match(smart, /reviewCorrections: activeCorrections/);
  assert.doesNotMatch(smart, /fixtureRouteRevision|fixtureVisibleSceneProvider/);
});

check("provider failure and recapture failure retain a deterministic manual fallback", () => {
  assert.match(smart, /Continue with the manual route/i);
  assert.match(smart, /setStage\("MANUAL"\)/);
});

console.log(`Route Assist production-boundary verification: ${passed} passed, 0 failed.`);
