import assert from "node:assert/strict";
import { pricePromiseOf } from "../lib/activationOutcome";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };
const tree = (routeAction: string, extra: Record<string, unknown> = {}) => ({
  bookingType: "INSTANT",
  questions: [{
    id: "question-1",
    key: "scope",
    options: [{ value: "ordinary", nextQuestionId: null, routeAction, ...extra }],
  }],
});

const instant = pricePromiseOf(tree("RESOLVE_INSTANT"), null);
ok(instant.promisesFixedPrice, "an authored instant-price outcome is priceable before materials or labor are configured");
ok(instant.routes.priced === 1 && instant.routes.review === 0, "unfinished economics do not relabel an instant service as quote-only");

const adjusted = pricePromiseOf(tree("RESOLVE_ADJUSTED"), null);
ok(adjusted.promisesFixedPrice, "an authored adjusted-price outcome is priceable before setup");

const preparationPhoto = pricePromiseOf(tree("PHOTO_REVIEW", { photosBlockBooking: false }), null);
ok(preparationPhoto.promisesFixedPrice, "non-blocking preparation photos retain the fixed-price promise");

const blockingPhoto = pricePromiseOf(tree("PHOTO_REVIEW", { photosBlockBooking: true }), null);
ok(!blockingPhoto.promisesFixedPrice && blockingPhoto.routes.review === 1, "blocking photo review remains a review outcome");

const remote = pricePromiseOf(tree("REMOTE_QUOTE"), null);
ok(!remote.promisesFixedPrice && remote.routes.review === 1, "remote quote remains honestly quote-only");

const reroute = pricePromiseOf(tree("REROUTE_SERVICE", { rerouteServiceId: "target-service" }), null);
ok(!reroute.promisesFixedPrice && reroute.handoffTargets[0] === "target-service", "service handoff remains a handoff and retains its target");

const diagnostic = pricePromiseOf(tree("REROUTE_TROUBLESHOOTING"), null);
ok(!diagnostic.promisesFixedPrice && diagnostic.routesToTroubleshooting, "troubleshooting handoff retains its activation dependency");

const continued = pricePromiseOf({
  bookingType: "ADJUSTED",
  questions: [
    { id: "question-1", key: "first", options: [{ value: "next", nextQuestionId: "question-2", routeAction: "CONTINUE" }] },
    { id: "question-2", key: "second", options: [{ value: "price", nextQuestionId: null, routeAction: "RESOLVE_INSTANT" }] },
  ],
}, null);
ok(continued.promisesFixedPrice && continued.routes.priced === 1, "reachable continuation paths retain their authored price outcome");

console.log(`PRICE PROMISE SETUP INDEPENDENCE — ${checks}/${checks} checks passed`);
