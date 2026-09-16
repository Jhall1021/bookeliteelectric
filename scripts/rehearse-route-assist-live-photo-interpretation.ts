/**
 * Attempts a REAL call to the live AI Gateway path for the photo-first
 * interpretation slice, using a controlled fixture image and a synthetic
 * A/B anchor pair matching the simple-doorway demo shape.
 *
 * This is a REHEARSAL, not a test: if the environment has no AI Gateway
 * credentials, it reports that exact blocker and exits non-zero rather than
 * fabricating a result. It does not stand in for
 * scripts/verify-route-assist-live-photo-interpretation.ts, which proves the
 * deterministic pipeline (validate -> adapt -> evaluate) with a fixture
 * provider regardless of credentials.
 *
 * Run: npx tsx scripts/rehearse-route-assist-live-photo-interpretation.ts
 */
import { createRouteAssistAiGatewayVisibleSceneProviderV1 } from "../lib/visual-assist/route-assist/visibleSceneProviderAdapter";
import { runRouteAssistVisibleSceneProviderV1, type RouteAssistVisibleSceneProviderInputV1 } from "../lib/visual-assist/route-assist/visibleSceneProvider";
import { applyRouteAssistLiveVisibleSceneFactsV1 } from "../lib/visual-assist/route-assist/livePhotoFactAdapter";
import { evaluateRouteAssistPhotoEscalationV1 } from "../lib/visual-assist/route-assist/captureEscalation";
import { emptyRouteAssistFactStoreV1, writeRouteAssistFactV1 } from "../lib/visual-assist/route-assist/factModel";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

// A minimal valid 1x1 white JPEG. It cannot itself show a real doorway --
// this rehearses the AUTH/REQUEST/RESPONSE-SHAPE path (does the call
// succeed at all, does the response validate), not real-world model
// accuracy on a real photo. A real accuracy rehearsal needs a real captured
// photo and real credentials, neither of which this sandboxed environment
// has -- see the report for exactly what that leaves unverified.
const FIXTURE_IMAGE_DATA_URL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBEMCw" +
  "sLDxQODRAWFRcYFRcXGyAdIB0jJzAqLR0oIiIhKS0qLjAtODY6QzhBRUhFPT9CRP/bAEMBCQkJCQkJCQoKCgsMDA" +
  "wPFA4NEBYVFxgVFxcbIB0gHSMnMCotHSgiIiEpLSouMC04NjpDOEFFSEU9P0JE/8AAEQgAAQABAwEiAAIRAQMRAf" +
  "/EABQAAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP" +
  "/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJgP/9k=";

async function main() {
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!token) {
    console.error("BLOCKED: no AI Gateway credentials in this environment.");
    console.error("Neither AI_GATEWAY_API_KEY nor VERCEL_OIDC_TOKEN is set.");
    console.error("This is expected outside a deployed Vercel preview/production environment -- both are injected by Vercel, not available in this local sandbox.");
    console.error("What IS proven without them: scripts/verify-route-assist-live-photo-interpretation.ts exercises the identical pipeline (validation, the CORNER-aware adapter, instance scoping, escalation) against a fixture provider satisfying the same RouteAssistVisibleSceneProviderV1 interface this rehearsal uses for the real one.");
    process.exitCode = 1;
    return;
  }

  console.log("Credentials present -- attempting a real AI Gateway call...");
  const imageId = "rehearsal-fixture-1";
  const points: RoutePoint[] = [
    { id: "A", kind: "SOURCE", x: 0.1, y: 0.5, imageId },
    { id: "B", kind: "DESTINATION", x: 0.85, y: 0.5, imageId },
  ];
  const segments: RouteSegment[] = [{ id: "leg-A-B", fromPointId: "A", toPointId: "B" }];
  const input: RouteAssistVisibleSceneProviderInputV1 = {
    version: 1,
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points,
    segments,
    captureArtifacts: { imageIds: [imageId], overlayImageIds: [] },
  };
  const provider = createRouteAssistAiGatewayVisibleSceneProviderV1({ media: [{ imageId, url: FIXTURE_IMAGE_DATA_URL }] });

  try {
    const run = await runRouteAssistVisibleSceneProviderV1(provider, input);
    if (!run.semantics) {
      console.error("Provider ran, but returned semantics that failed validation:", run.problems);
      process.exitCode = 1;
      return;
    }
    console.log("Provider run succeeded. Validated semantics:", JSON.stringify(run.semantics, null, 2));

    const application = applyRouteAssistLiveVisibleSceneFactsV1({
      store: emptyRouteAssistFactStoreV1(),
      semantics: run.semantics,
      legScopeId: "leg-A-B",
      sourcePointId: "A",
      destinationPointId: "B",
      imageId,
      sourceAnchor: points[0],
      destinationAnchor: points[1],
      providerKey: provider.providerKey,
    });
    if (application.problems.length) console.warn("Adapter problems:", application.problems);

    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B" });
    console.log("Escalation:", escalation);
    console.log("NOTE: this fixture image has no real doorway/baseboard content, so PHOTO_SUFFICIENT here would not be a meaningful accuracy result -- it would only prove the network/auth/schema path worked. A meaningful accuracy rehearsal needs a real captured photo of the demo scene.");
  } catch (error) {
    console.error("Live provider call failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

void main();
