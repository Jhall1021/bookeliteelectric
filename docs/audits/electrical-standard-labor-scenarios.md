# Electrical standard labor scenarios

Generated from the executable atomic recipes. A standard means only that the physical quantities are bounded; it does not approve labor, duration, or price.

- Priceable services classified: **76**
- Bounded standard scopes: **39**
- Route/job-specific scopes: **37**
- Publish authority: **none**

## Bounded standard scopes

| Service | Family | Recipe | Physical basis |
|---|---|---|---|
| `200a-service-upgrade` | Breakers, panels and service equipment | `ELECTRICAL_200A_SERVICE_UPGRADE` | seed-200a-service-upgrade.ts: defined 20 ft service entrance, 2 electrodes, 17 single-pole and 3 double-pole branches; ELEC_PANEL_REPLACEMENT_SETUP×1, ELEC_REMOVE_EXISTING_PANEL×1, ELEC_REPLACE_METER_SOCKET×1, ELEC_MOUNT_LOADCENTER×1, ELEC_SERVICE_ENTRANCE_CONDUCTOR×20, ELEC_INSTALL_GROUNDING_ELECTRODE×2, ELEC_RECONNECT_SINGLE_POLE_BRANCH×17, ELEC_RECONNECT_DOUBLE_POLE_BRANCH×3, ELEC_TERMINATE_MAIN_FEEDER×1, ELEC_PANEL_GROUND_AND_BOND×1, ELEC_PANEL_LABEL_AND_TEST×1 |
| `bathroom-fan-light-combo` | Lighting, fans and lighting controls | `ELECTRICAL_BATH_FAN_OWNER_SUPPLIED` | seed-bathroom-fans.ts: owner-supplied straight-swap baseline; housing or duct work is disclosed as nonstandard and separately approved; ELEC_REPLACE_BATH_EXHAUST_FAN×1 |
| `dishwasher-electrical` | Appliance electrical connections | `ELECTRICAL_DISHWASHER_CONNECTION` | recipe contains only fixed physical quantities; ELEC_DISHWASHER_DISCONNECT_RECONNECT×1 |
| `doorbell-transformer-replacement` | TV, data, doorbell and camera work | `ELECTRICAL_DOORBELL_TRANSFORMER` | recipe contains only fixed physical quantities; ELEC_REPLACE_DOORBELL_TRANSFORMER×1 |
| `double-pole-breaker-replacement` | Breakers, panels and service equipment | `ELECTRICAL_DOUBLE_POLE_BREAKER_REPLACEMENT` | recipe contains only fixed physical quantities; ELEC_REPLACE_DOUBLE_POLE_BREAKER×1 |
| `dryer-receptacle-replacement` | Device replacement and controls | `ELECTRICAL_REPLACE_HIGH_AMP_RECEPTACLE` | recipe contains only fixed physical quantities; ELEC_REPLACE_HIGH_AMP_RECEPTACLE×1 |
| `electrical-panel-replacement` | Breakers, panels and service equipment | `ELECTRICAL_PANEL_REPLACEMENT` | seed-panel-replacement.ts: defined 17 single-pole and 3 double-pole branch reconnections; ELEC_PANEL_REPLACEMENT_SETUP×1, ELEC_REMOVE_EXISTING_PANEL×1, ELEC_MOUNT_LOADCENTER×1, ELEC_RECONNECT_SINGLE_POLE_BRANCH×17, ELEC_RECONNECT_DOUBLE_POLE_BRANCH×3, ELEC_TERMINATE_MAIN_FEEDER×1, ELEC_PANEL_GROUND_AND_BOND×1, ELEC_PANEL_LABEL_AND_TEST×1 |
| `elite-articulating-mount` | TV, data, doorbell and camera work | `ELECTRICAL_FULL_MOTION_MOUNT_ADDON` | recipe contains only fixed physical quantities; ELEC_INSTALL_FULL_MOTION_TV_MOUNT×1 |
| `elite-tilt-mount` | TV, data, doorbell and camera work | `ELECTRICAL_TILT_MOUNT_ADDON` | recipe contains only fixed physical quantities; ELEC_INSTALL_TILT_TV_MOUNT×1 |
| `exterior-gfci-standard` | Branch circuits, outlets and physical routing | `ELECTRICAL_EXTERIOR_GFCI_BACK_TO_BACK` | recipe contains only fixed physical quantities; ELEC_PENETRATE_EXTERIOR_WALL×1, ELEC_INSTALL_WEATHERPROOF_RECEPTACLE_BOX×1, ELEC_INSTALL_NEW_GFCI_RECEPTACLE×1 |
| `fan-replacing-light` | Lighting, fans and lighting controls | `ELECTRICAL_FAN_REPLACING_LIGHT` | seed-materials.ts: standard package always includes one fan-rated box/support rather than asking the homeowner to diagnose the existing box; ELEC_REMOVE_LIGHT_FIXTURE×1, ELEC_INSTALL_FAN_RATED_BOX×1, ELEC_INSTALL_NEW_CEILING_FAN×1 |
| `garbage-disposal-install` | Appliance electrical connections | `ELECTRICAL_DISPOSAL_CONNECTION` | recipe contains only fixed physical quantities; ELEC_DISPOSAL_DISCONNECT_RECONNECT×1 |
| `generator-inlet-interlock` | Outdoor, generator, pool and spa | `ELECTRICAL_GENERATOR_INLET_INTERLOCK` | seed-generator-inlet.ts: defined 10 ft feeder package; ELEC_ROUTE_LAYOUT_SETUP×1, ELEC_INSTALL_GENERATOR_INLET×1, ELEC_INSTALL_PANEL_INTERLOCK×1, ELEC_REPLACE_DOUBLE_POLE_BREAKER×1, ELEC_NM_CABLE_ACCESSIBLE×10 |
| `hardwired-smoke-detector` | Device replacement and controls | `ELECTRICAL_REPLACE_HARDWIRED_DETECTOR` | recipe contains only fixed physical quantities; ELEC_REPLACE_HARDWIRED_DETECTOR×1 |
| `install-new-microwave` | Appliance electrical connections | `ELECTRICAL_NEW_OTR_MICROWAVE` | prepared/mount-only package: existing hood removal and feed conversion are excluded; those conditions require review; ELEC_MOUNT_NEW_OTR_MICROWAVE×1 |
| `occupancy-motion-switch` | Device replacement and controls | `ELECTRICAL_OCCUPANCY_CONTROL` | recipe contains only fixed physical quantities; ELEC_INSTALL_OCCUPANCY_CONTROL×1 |
| `otr-microwave-install` | Appliance electrical connections | `ELECTRICAL_OTR_MICROWAVE_REPLACEMENT` | recipe contains only fixed physical quantities; ELEC_REPLACE_OTR_MICROWAVE×1 |
| `range-receptacle-replacement` | Device replacement and controls | `ELECTRICAL_REPLACE_HIGH_AMP_RECEPTACLE` | recipe contains only fixed physical quantities; ELEC_REPLACE_HIGH_AMP_RECEPTACLE×1 |
| `replace-3-way-switch` | Device replacement and controls | `ELECTRICAL_REPLACE_THREE_WAY` | recipe contains only fixed physical quantities; ELEC_REPLACE_THREE_WAY_SWITCH×1 |
| `replace-bathroom-exhaust-fan` | Lighting, fans and lighting controls | `ELECTRICAL_BATH_FAN_CONTRACTOR_SUPPLIED` | build-fan-packages.ts: standard-size replacement fan with an existing reusable duct connection; nonstandard scope routes to review; ELEC_REPLACE_BATH_EXHAUST_FAN×1 |
| `replace-bathroom-exhaust-fan-with-light` | Lighting, fans and lighting controls | `ELECTRICAL_BATH_FAN_LIGHT_CONTRACTOR_SUPPLIED` | build-fan-packages.ts: standard-size fan/light with an existing reusable duct connection; nonstandard scope routes to review; ELEC_REPLACE_BATH_EXHAUST_FAN×1 |
| `replace-ceiling-fan` | Lighting, fans and lighting controls | `ELECTRICAL_REPLACE_CEILING_FAN` | recipe contains only fixed physical quantities; ELEC_REPLACE_CEILING_FAN×1 |
| `replace-exterior-light-fixture` | Lighting, fans and lighting controls | `ELECTRICAL_REPLACE_EXTERIOR_LIGHT` | recipe contains only fixed physical quantities; ELEC_REPLACE_EXTERIOR_LIGHT_FIXTURE×1 |
| `replace-gfci-outlet` | Device replacement and controls | `ELECTRICAL_REPLACE_GFCI` | recipe contains only fixed physical quantities; ELEC_REPLACE_GFCI_RECEPTACLE×1 |
| `replace-interior-light-fixture` | Lighting, fans and lighting controls | `ELECTRICAL_REPLACE_INTERIOR_LIGHT` | recipe contains only fixed physical quantities; ELEC_REPLACE_INTERIOR_LIGHT_FIXTURE×1 |
| `replace-led-dimmer` | Device replacement and controls | `ELECTRICAL_REPLACE_LED_DIMMER` | recipe contains only fixed physical quantities; ELEC_REPLACE_LED_DIMMER×1 |
| `replace-motion-flood-light` | Lighting, fans and lighting controls | `ELECTRICAL_REPLACE_MOTION_FLOOD` | recipe contains only fixed physical quantities; ELEC_REPLACE_MOTION_FLOOD_FIXTURE×1 |
| `replace-range-hood` | Appliance electrical connections | `ELECTRICAL_RANGE_HOOD_CLEAN_SWAP` | recipe contains only fixed physical quantities; ELEC_REPLACE_RANGE_HOOD_CLEAN_SWAP×1 |
| `replace-standard-outlet` | Device replacement and controls | `ELECTRICAL_REPLACE_STANDARD_RECEPTACLE` | recipe contains only fixed physical quantities; ELEC_REPLACE_STANDARD_RECEPTACLE×1 |
| `replace-standard-switch` | Device replacement and controls | `ELECTRICAL_REPLACE_STANDARD_SWITCH` | recipe contains only fixed physical quantities; ELEC_REPLACE_STANDARD_SWITCH×1 |
| `replace-wall-sconce` | Lighting, fans and lighting controls | `ELECTRICAL_REPLACE_WALL_SCONCE` | recipe contains only fixed physical quantities; ELEC_REPLACE_WALL_SCONCE×1 |
| `single-pole-breaker-replacement` | Breakers, panels and service equipment | `ELECTRICAL_SINGLE_POLE_BREAKER_REPLACEMENT` | recipe contains only fixed physical quantities; ELEC_REPLACE_SINGLE_POLE_BREAKER×1 |
| `smoke-co-detector` | Device replacement and controls | `ELECTRICAL_REPLACE_HARDWIRED_DETECTOR` | recipe contains only fixed physical quantities; ELEC_REPLACE_HARDWIRED_DETECTOR×1 |
| `timer-switch-install` | Device replacement and controls | `ELECTRICAL_TIMER_CONTROL` | recipe contains only fixed physical quantities; ELEC_INSTALL_TIMER_CONTROL×1 |
| `tv-install-existing-location` | TV, data, doorbell and camera work | `ELECTRICAL_TV_EXISTING_LOCATION` | recipe contains only fixed physical quantities; ELEC_MOUNT_TV_EXISTING_LOCATION×1 |
| `tv-installation` | TV, data, doorbell and camera work | `ELECTRICAL_TV_NEW_LOCATION` | recipe contains only fixed physical quantities; ELEC_MOUNT_TV_NEW_LOCATION×1 |
| `under-cabinet-led-lighting` | Lighting, fans and lighting controls | `ELECTRICAL_UNDERCABINET_LIGHTING` | seed-under-cabinet-lighting.ts: defined 12 ft tape/channel package with one run and one driver; ELEC_UNDERCABINET_LAYOUT×1, ELEC_UNDERCABINET_CHANNEL_AND_TAPE×12, ELEC_UNDERCABINET_RUN_TERMINATION×1, ELEC_INSTALL_LED_DRIVER×1, ELEC_INSTALL_LED_DIMMER×1 |
| `usb-outlet-upgrade` | Device replacement and controls | `ELECTRICAL_REPLACE_USB_RECEPTACLE` | recipe contains only fixed physical quantities; ELEC_REPLACE_USB_RECEPTACLE×1 |
| `whole-house-surge-protection` | Breakers, panels and service equipment | `ELECTRICAL_WHOLE_HOUSE_SURGE` | recipe contains only fixed physical quantities; ELEC_INSTALL_WHOLE_HOUSE_SPD×1 |

## No honest standard scope

These services need facts from the actual route, equipment, or selected option. Missing facts are shown rather than replaced by zeroes or averages.

| Service | Family | Recipe | Required facts |
|---|---|---|---|
| `240v-garage-outlet` | Branch circuits, outlets and physical routing | `ELECTRICAL_NEW_240V_RECEPTACLE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `240v-garage-outlet-14-30` | Branch circuits, outlets and physical routing | `ELECTRICAL_NEW_240V_RECEPTACLE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `240v-garage-outlet-14-50` | Branch circuits, outlets and physical routing | `ELECTRICAL_NEW_240V_RECEPTACLE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `240v-garage-outlet-6-50` | Branch circuits, outlets and physical routing | `ELECTRICAL_NEW_240V_RECEPTACLE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `bidet-smart-toilet-outlet` | Branch circuits, outlets and physical routing | `ELECTRICAL_NEW_120V_RECEPTACLE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `customer-supplied-smart-switch` | Device replacement and controls | `ELECTRICAL_SMART_DEVICE` | commissioningIncluded |
| `dedicated-120v-circuit-outlet` | Branch circuits, outlets and physical routing | `ELECTRICAL_DEDICATED_120V_RECEPTACLE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `electric-fireplace-circuit` | Branch circuits, outlets and physical routing | `ELECTRICAL_DEDICATED_120V_RECEPTACLE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `exterior-gfci-other-routing` | Branch circuits, outlets and physical routing | `ELECTRICAL_EXTERIOR_GFCI_ROUTED` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `floodlight-camera-existing` | TV, data, doorbell and camera work | `ELECTRICAL_FLOOD_CAMERA_EXISTING` | commissioningIncluded |
| `freezer-fridge-dedicated-circuit` | Branch circuits, outlets and physical routing | `ELECTRICAL_DEDICATED_120V_RECEPTACLE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `garage-door-opener-outlet` | Branch circuits, outlets and physical routing | `ELECTRICAL_NEW_120V_RECEPTACLE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `garage-door-opener-outlet-ev` | Branch circuits, outlets and physical routing | `ELECTRICAL_NEW_120V_RECEPTACLE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `hot-tub-spa-electrical` | Outdoor, generator, pool and spa | `ELECTRICAL_HOT_TUB_SPA` | bondingConnectionCount, feederCableFeet, racewayFeet |
| `level-2-ev-charger` | Branch circuits, outlets and physical routing | `ELECTRICAL_LEVEL_2_EVSE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `new-120v-outlet` | Branch circuits, outlets and physical routing | `ELECTRICAL_NEW_120V_RECEPTACLE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `new-240v-appliance-circuit` | Branch circuits, outlets and physical routing | `ELECTRICAL_NEW_240V_RECEPTACLE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `new-ceiling-fan` | Lighting, fans and lighting controls | `ELECTRICAL_NEW_CEILING_FAN` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `new-ceiling-light` | Lighting, fans and lighting controls | `ELECTRICAL_NEW_CEILING_LIGHT` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `new-coax-line` | TV, data, doorbell and camera work | `ELECTRICAL_COAX_POINT` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute |
| `new-ethernet-line` | TV, data, doorbell and camera work | `ELECTRICAL_ETHERNET_POINT` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute |
| `new-exterior-flood-camera` | TV, data, doorbell and camera work | `ELECTRICAL_FLOOD_CAMERA_NEW_LOCATION` | accessibleRoute, accessibleRouteFeet, commissioningIncluded, concealedRouteFeet, finishedRoute |
| `new-exterior-lighting-locations` | Outdoor, generator, pool and spa | `ELECTRICAL_NEW_EXTERIOR_LIGHT_LOCATIONS` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, exteriorLightCount, finishedRoute |
| `new-video-doorbell-wiring` | TV, data, doorbell and camera work | `ELECTRICAL_VIDEO_DOORBELL_NEW_WIRING` | commissioningIncluded, newTransformerRequired, platePenetrationRequired, routeFeet |
| `new-wall-sconce` | Lighting, fans and lighting controls | `ELECTRICAL_NEW_WALL_SCONCE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `outdoor-landscape-lighting` | Outdoor, generator, pool and spa | `ELECTRICAL_LANDSCAPE_LIGHTING` | landscapeCableFeet, landscapeFixtureCount |
| `pool-equipment-electrical` | Outdoor, generator, pool and spa | `ELECTRICAL_POOL_EQUIPMENT` | bondingConnectionCount, circuitCount, conductorFeet, equipmentConnectionCount, racewayFeet |
| `recessed-lighting` | Lighting, fans and lighting controls | `ELECTRICAL_RECESSED_LIGHT_GROUP` | accessibleRoute, finishedRoute, framingSpacingInches, interLightCableFeet, lightCount, perpendicularCeilingFeet |
| `smart-outlet-upgrade` | Device replacement and controls | `ELECTRICAL_SMART_DEVICE` | commissioningIncluded |
| `smart-thermostat-install` | Device replacement and controls | `ELECTRICAL_SMART_THERMOSTAT` | commissioningIncluded |
| `soundbar-installation` | TV, data, doorbell and camera work | `ELECTRICAL_SOUNDBAR` | concealedCableFeet, concealmentIncluded |
| `sump-pump-dedicated-circuit` | Branch circuits, outlets and physical routing | `ELECTRICAL_DEDICATED_120V_RECEPTACLE` | accessibleRoute, accessibleRouteFeet, concealedRouteFeet, finishedRoute, framingSpacingInches, perpendicularFramingFeet |
| `surface-mounted-fixture-box` | Branch circuits, outlets and physical routing | `ELECTRICAL_SURFACE_FIXTURE_BOX_SERVICE` | conductorFeet, flatCornerCount, insideCornerCount, outsideCornerCount, straightJointCount, supportCount, surfaceRouteFeet, transitionCount |
| `surface-mounted-outlet` | Branch circuits, outlets and physical routing | `ELECTRICAL_SURFACE_OUTLET_SERVICE` | conductorFeet, flatCornerCount, insideCornerCount, outsideCornerCount, straightJointCount, supportCount, surfaceRouteFeet, transitionCount |
| `surface-mounted-switch` | Branch circuits, outlets and physical routing | `ELECTRICAL_SURFACE_SWITCH_SERVICE` | conductorFeet, flatCornerCount, insideCornerCount, outsideCornerCount, straightJointCount, supportCount, surfaceRouteFeet, transitionCount |
| `transfer-switch` | Outdoor, generator, pool and spa | `ELECTRICAL_TRANSFER_SWITCH` | conductorFeet, racewayFeet, transferredCircuitCount |
| `video-doorbell-existing-wiring` | TV, data, doorbell and camera work | `ELECTRICAL_VIDEO_DOORBELL_EXISTING` | commissioningIncluded |

