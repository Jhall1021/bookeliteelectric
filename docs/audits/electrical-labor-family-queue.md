# Electrical labor family queue

> Generated from `electrical-labor-coverage-ledger.json` and the checked family registry. Do not edit totals by hand.

This queue covers every catalog service exactly once. `ATOMIC_STARTED` means decomposition has begun; it does not mean every route is complete or calibrated.

| Family | Status | Services | Active | Priceable outcomes | Structurally clean | Priceable paths |
|---|---:|---:|---:|---:|---:|---:|
| Branch circuits, outlets and physical routing | ATOMIC_STARTED | 19 | 9 | 24 | 0 | 268 |
| Device replacement and controls | ATOMIC_STARTED | 15 | 15 | 15 | 9 | 33 |
| Lighting, fans and lighting controls | ATOMIC_STARTED | 14 | 13 | 269 | 6 | 2336 |
| Appliance electrical connections | ATOMIC_STARTED | 5 | 5 | 6 | 2 | 9 |
| TV, data, doorbell and camera work | ATOMIC_STARTED | 12 | 10 | 15 | 4 | 44 |
| Breakers, panels and service equipment | ATOMIC_STARTED | 5 | 5 | 5 | 3 | 5 |
| Outdoor, generator, pool and spa | QUEUED | 6 | 6 | 2 | 0 | 2 |
| Diagnostics, inspection and review-led work | NON_PRICEABLE_REVIEW | 2 | 2 | 2 | 1 | 2 |
| Internal Routing V2 proof fixtures | INTERNAL_FIXTURE | 4 | 0 | 6 | 0 | 6 |

## Branch circuits, outlets and physical routing

Status: **ATOMIC_STARTED**

| Service | Active | Priceable outcomes | Clean | Principal gaps |
|---|---:|---:|---:|---|
| 240V Garage Outlet `240v-garage-outlet` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1), BUNDLED_COMPOSITE_BASE (1), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| 240V Garage Outlet — 30A, 4-prong `240v-garage-outlet-14-30` | no | 1 | 0 | MISSING_SERVICE_EVIDENCE (1) |
| 240V Garage Outlet — 50A, 4-prong `240v-garage-outlet-14-50` | no | 1 | 0 | MISSING_SERVICE_EVIDENCE (1) |
| 240V Garage Outlet — 50A, 3-prong `240v-garage-outlet-6-50` | no | 1 | 0 | MISSING_SERVICE_EVIDENCE (1) |
| Bidet / Smart Toilet Outlet `bidet-smart-toilet-outlet` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1) |
| Dedicated Circuit & Outlet `dedicated-120v-circuit-outlet` | yes | 3 | 0 | PARTIAL_SERVICE_EVIDENCE (3), BUNDLED_COMPOSITE_BASE (3), EVIDENCE_NOT_IMPORTED (2), PARTIAL_COMPONENT_EVIDENCE (2), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| Electric Fireplace Circuit / Outlet `electric-fireplace-circuit` | no | 0 | 0 | none detected |
| Exterior GFCI — New Outlet Location `exterior-gfci-other-routing` | yes | 4 | 0 | PARTIAL_SERVICE_EVIDENCE (4), BUNDLED_COMPOSITE_BASE (4), EVIDENCE_NOT_IMPORTED (4), PARTIAL_COMPONENT_EVIDENCE (4) |
| Exterior GFCI — Back-to-Back Power `exterior-gfci-standard` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1), BUNDLED_COMPOSITE_BASE (1), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| Freezer / Refrigerator Dedicated Circuit `freezer-fridge-dedicated-circuit` | no | 0 | 0 | none detected |
| Garage Door Opener Outlet `garage-door-opener-outlet` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1) |
| Garage Door Opener Outlet `garage-door-opener-outlet-ev` | yes | 2 | 0 | PARTIAL_SERVICE_EVIDENCE (2) |
| Level 2 EV Charger Installation `level-2-ev-charger` | yes | 0 | 0 | none detected |
| New 120V Outlet `new-120v-outlet` | yes | 5 | 0 | PARTIAL_SERVICE_EVIDENCE (5), BUNDLED_COMPOSITE_BASE (5), MISSING_COMPONENT_LABOR (5), PARTIAL_COMPONENT_EVIDENCE (5), MISSING_COMPONENT_EVIDENCE (5) |
| New 240V Appliance Circuit `new-240v-appliance-circuit` | no | 0 | 0 | none detected |
| Sump Pump Dedicated Circuit `sump-pump-dedicated-circuit` | no | 0 | 0 | none detected |
| Surface-Mounted Fixture Box `surface-mounted-fixture-box` | no | 1 | 0 | MISSING_BASE_LABOR (1), MISSING_COMPONENT_LABOR (1), MISSING_COMPONENT_EVIDENCE (1), PARTIAL_COMPONENT_EVIDENCE (1) |
| Surface-Mounted Outlet `surface-mounted-outlet` | no | 1 | 0 | MISSING_BASE_LABOR (1), MISSING_COMPONENT_LABOR (1), MISSING_COMPONENT_EVIDENCE (1), PARTIAL_COMPONENT_EVIDENCE (1) |
| Surface-Mounted Switch `surface-mounted-switch` | no | 1 | 0 | MISSING_BASE_LABOR (1), MISSING_COMPONENT_LABOR (1), MISSING_COMPONENT_EVIDENCE (1), PARTIAL_COMPONENT_EVIDENCE (1) |

## Device replacement and controls

Status: **ATOMIC_STARTED**

| Service | Active | Priceable outcomes | Clean | Principal gaps |
|---|---:|---:|---:|---|
| Customer-Supplied Smart Switch `customer-supplied-smart-switch` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1) |
| Hardwired Smoke Detector `hardwired-smoke-detector` | yes | 1 | 1 | none detected |
| Occupancy / Motion Sensor Switch `occupancy-motion-switch` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1) |
| Replace 220V Electric Range/Stove Outlet `range-receptacle-replacement` | yes | 1 | 1 | none detected |
| Remove and Replace Existing 220V Dryer Outlet `dryer-receptacle-replacement` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1) |
| Replace 3-Way Switch `replace-3-way-switch` | yes | 1 | 1 | none detected |
| Replace GFCI Outlet `replace-gfci-outlet` | yes | 1 | 1 | none detected |
| Replace LED Dimmer `replace-led-dimmer` | yes | 1 | 1 | none detected |
| Replace Standard Outlet `replace-standard-outlet` | yes | 1 | 1 | none detected |
| Replace Standard Switch `replace-standard-switch` | yes | 1 | 1 | none detected |
| Smart Outlet Upgrade `smart-outlet-upgrade` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1) |
| Smart Thermostat Installation `smart-thermostat-install` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1) |
| Smoke / CO Detector `smoke-co-detector` | yes | 1 | 1 | none detected |
| Timer Switch Installation `timer-switch-install` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1) |
| USB / USB-C Outlet Upgrade `usb-outlet-upgrade` | yes | 1 | 1 | none detected |

## Lighting, fans and lighting controls

Status: **ATOMIC_STARTED**

| Service | Active | Priceable outcomes | Clean | Principal gaps |
|---|---:|---:|---:|---|
| Remove and Replace Owner-Supplied Bathroom Exhaust Fan `bathroom-fan-light-combo` | yes | 1 | 1 | none detected |
| Fan Replacing Existing Light `fan-replacing-light` | yes | 18 | 0 | PARTIAL_SERVICE_EVIDENCE (18), BUNDLED_COMPOSITE_BASE (18), EVIDENCE_NOT_IMPORTED (15), PARTIAL_COMPONENT_EVIDENCE (15), MISSING_COMPONENT_EVIDENCE (4), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| Install New Ceiling Fan `new-ceiling-fan` | yes | 24 | 0 | PARTIAL_SERVICE_EVIDENCE (24), BUNDLED_COMPOSITE_BASE (24), EVIDENCE_NOT_IMPORTED (20), PARTIAL_COMPONENT_EVIDENCE (20), MISSING_COMPONENT_EVIDENCE (14), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| Install New Ceiling Light `new-ceiling-light` | yes | 24 | 0 | PARTIAL_SERVICE_EVIDENCE (24), BUNDLED_COMPOSITE_BASE (24), EVIDENCE_NOT_IMPORTED (20), PARTIAL_COMPONENT_EVIDENCE (20), MISSING_COMPONENT_EVIDENCE (14), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| Install a New Wall Sconce `new-wall-sconce` | yes | 2 | 0 | PARTIAL_SERVICE_EVIDENCE (2), BUNDLED_COMPOSITE_BASE (2), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1), MISSING_COMPONENT_EVIDENCE (1) |
| Recessed Lighting Installation `recessed-lighting` | yes | 192 | 0 | PARTIAL_SERVICE_EVIDENCE (192), BUNDLED_COMPOSITE_BASE (192), EVIDENCE_NOT_IMPORTED (190), PARTIAL_COMPONENT_EVIDENCE (190), MISSING_COMPONENT_EVIDENCE (32), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| Replace Bathroom Exhaust Fan — We Supply the Fan `replace-bathroom-exhaust-fan` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1) |
| Replace Bathroom Exhaust Fan with Light — We Supply the Fan `replace-bathroom-exhaust-fan-with-light` | no | 1 | 0 | MISSING_SERVICE_EVIDENCE (1) |
| Replace Existing Ceiling Fan `replace-ceiling-fan` | yes | 1 | 1 | none detected |
| Replace Exterior Light Fixture `replace-exterior-light-fixture` | yes | 1 | 1 | none detected |
| Replace Interior Light Fixture `replace-interior-light-fixture` | yes | 1 | 1 | none detected |
| Replace Motion / Flood Light `replace-motion-flood-light` | yes | 1 | 1 | none detected |
| Replace an Existing Wall Sconce `replace-wall-sconce` | yes | 1 | 1 | none detected |
| Professional LED Under-Cabinet Lighting `under-cabinet-led-lighting` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1), BUNDLED_COMPOSITE_BASE (1), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |

## Appliance electrical connections

Status: **ATOMIC_STARTED**

| Service | Active | Priceable outcomes | Clean | Principal gaps |
|---|---:|---:|---:|---|
| Dishwasher Electrical Connection / Reconnection `dishwasher-electrical` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1) |
| Garbage Disposal Electrical Disconnect / Reconnect `garbage-disposal-install` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1) |
| Install New Microwave `install-new-microwave` | yes | 2 | 0 | PARTIAL_SERVICE_EVIDENCE (2) |
| Remove and Replace Existing Microwave `otr-microwave-install` | yes | 1 | 1 | none detected |
| Replace Existing Range Hood `replace-range-hood` | yes | 1 | 1 | none detected |

## TV, data, doorbell and camera work

Status: **ATOMIC_STARTED**

| Service | Active | Priceable outcomes | Clean | Principal gaps |
|---|---:|---:|---:|---|
| Doorbell Transformer Replacement `doorbell-transformer-replacement` | yes | 1 | 1 | none detected |
| Elite Full-Motion Articulating Mount `elite-articulating-mount` | no | 1 | 0 | MISSING_BASE_LABOR (1) |
| Elite Tilt TV Mount `elite-tilt-mount` | no | 1 | 0 | MISSING_BASE_LABOR (1) |
| Floodlight Camera at Existing Fixture `floodlight-camera-existing` | yes | 1 | 0 | MISSING_SERVICE_EVIDENCE (1) |
| Install New Coax / Cable TV Line `new-coax-line` | yes | 2 | 0 | PARTIAL_SERVICE_EVIDENCE (2), BUNDLED_COMPOSITE_BASE (2), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1), MISSING_COMPONENT_EVIDENCE (1) |
| Install New Ethernet / Network Line `new-ethernet-line` | yes | 2 | 0 | PARTIAL_SERVICE_EVIDENCE (2), BUNDLED_COMPOSITE_BASE (2), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1), MISSING_COMPONENT_EVIDENCE (1) |
| New Exterior Flood or Camera Location `new-exterior-flood-camera` | yes | 1 | 0 | MISSING_SERVICE_EVIDENCE (1), BUNDLED_COMPOSITE_BASE (1), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| New Video Doorbell Wiring `new-video-doorbell-wiring` | yes | 1 | 0 | MISSING_SERVICE_EVIDENCE (1), BUNDLED_COMPOSITE_BASE (1), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| Customer-Supplied Soundbar Installation `soundbar-installation` | yes | 1 | 1 | none detected |
| Install TV in Existing Location `tv-install-existing-location` | yes | 2 | 2 | none detected |
| Professional TV Installation `tv-installation` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1), BUNDLED_COMPOSITE_BASE (1), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| Video Doorbell — Existing Wiring `video-doorbell-existing-wiring` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1) |

## Breakers, panels and service equipment

Status: **ATOMIC_STARTED**

| Service | Active | Priceable outcomes | Clean | Principal gaps |
|---|---:|---:|---:|---|
| 200-Amp Service Upgrade `200a-service-upgrade` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1), BUNDLED_COMPOSITE_BASE (1), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| Double-Pole Breaker Replacement `double-pole-breaker-replacement` | yes | 1 | 1 | none detected |
| Electrical Panel Replacement `electrical-panel-replacement` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1), BUNDLED_COMPOSITE_BASE (1), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| Single-Pole Breaker Replacement `single-pole-breaker-replacement` | yes | 1 | 1 | none detected |
| Whole-House Surge Protection `whole-house-surge-protection` | yes | 1 | 1 | none detected |

## Outdoor, generator, pool and spa

Status: **QUEUED**

| Service | Active | Priceable outcomes | Clean | Principal gaps |
|---|---:|---:|---:|---|
| Generator Inlet + Interlock `generator-inlet-interlock` | yes | 1 | 0 | MISSING_SERVICE_EVIDENCE (1), BUNDLED_COMPOSITE_BASE (1), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| Hot Tub / Spa Electrical `hot-tub-spa-electrical` | yes | 1 | 0 | MISSING_SERVICE_EVIDENCE (1), BUNDLED_COMPOSITE_BASE (1), COMPOSITE_ROUTE_WITHOUT_COMPONENTS (1) |
| New Exterior Lighting Locations `new-exterior-lighting-locations` | yes | 0 | 0 | none detected |
| Outdoor Landscape Lighting `outdoor-landscape-lighting` | yes | 0 | 0 | none detected |
| Pool Equipment Electrical `pool-equipment-electrical` | yes | 0 | 0 | none detected |
| Transfer Switch `transfer-switch` | yes | 0 | 0 | none detected |

## Diagnostics, inspection and review-led work

Status: **NON_PRICEABLE_REVIEW**

| Service | Active | Priceable outcomes | Clean | Principal gaps |
|---|---:|---:|---:|---|
| Electrical Troubleshooting `electrical-troubleshooting` | yes | 1 | 0 | PARTIAL_SERVICE_EVIDENCE (1) |
| Home Electrical Safety Inspection `home-electrical-safety-inspection` | yes | 1 | 1 | none detected |

## Internal Routing V2 proof fixtures

Status: **INTERNAL_FIXTURE**

| Service | Active | Priceable outcomes | Clean | Principal gaps |
|---|---:|---:|---:|---|
| RV2 fixture — accessible concealed (outlet) `rv2-fixture-accessible-outlet` | no | 1 | 0 | MISSING_BASE_LABOR (1), MISSING_COMPONENT_LABOR (1), PARTIAL_COMPONENT_EVIDENCE (1), MISSING_COMPONENT_EVIDENCE (1) |
| RV2 fixture — accessible concealed (switch) `rv2-fixture-accessible-switch` | no | 1 | 0 | MISSING_BASE_LABOR (1), MISSING_COMPONENT_LABOR (1), PARTIAL_COMPONENT_EVIDENCE (1), MISSING_COMPONENT_EVIDENCE (1) |
| RV2 fixture — back to back (outlet) `rv2-fixture-back-to-back-outlet` | no | 1 | 0 | MISSING_BASE_LABOR (1), MISSING_COMPONENT_LABOR (1), MISSING_COMPONENT_EVIDENCE (1), PARTIAL_COMPONENT_EVIDENCE (1) |
| RV2 fixture — finished wall (outlet) `rv2-fixture-finished-wall-outlet` | no | 3 | 0 | MISSING_BASE_LABOR (3), MISSING_COMPONENT_LABOR (3), MISSING_COMPONENT_EVIDENCE (3), PARTIAL_COMPONENT_EVIDENCE (3) |
