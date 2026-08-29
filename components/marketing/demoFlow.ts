/**
 * GENERATED — do not edit by hand.
 *
 * Written by scripts/capture-demo-flow.ts by walking a real service's real
 * question tree and resolving EVERY path with the same resolveRoute the
 * storefront calls. Every price and every routing decision below came out of
 * the pricing engine, not out of somebody's head.
 *
 * Regenerate:
 *   npx tsx scripts/demo-contractor.ts --create
 *   npx tsx scripts/capture-demo-flow.ts --service new-120v-outlet
 *   npx tsx scripts/demo-contractor.ts --destroy
 */
export const DEMO_FLOW = {
  "generatedBy": "scripts/capture-demo-flow.ts",
  "contractor": "Voltmark Electric",
  "note": "A demonstration contractor. Every price and routing decision below was produced by the real pricing engine and route resolver.",
  "search": {
    "query": "I need another outlet in my living room",
    "serviceName": "New 120V Outlet",
    "matchKind": "suggestion"
  },
  "copy": {
    "confirmAfterLook": "We'll confirm your price after a quick look"
  },
  "primary": "new-120v-outlet",
  "flows": {
    "new-120v-outlet": {
      "key": "new-120v-outlet",
      "name": "New 120V Outlet",
      "description": "A new outlet where you need one, powered from the nearest circuit. Right for everyday things — lamps, a TV, chargers, a computer. If it's for a fridge, freezer, air conditioner or anything that heats, that needs its own circuit: see Dedicated Circuit & Outlet.",
      "steps": [
        {
          "key": "outlet_load_type",
          "prompt": "What will you be plugging in?",
          "helpText": "Some things need a circuit of their own so they can't be knocked out by whatever else is on it.",
          "options": [
            {
              "value": "everyday",
              "label": "Everyday things — lamps, a TV, chargers, a computer",
              "disclaimer": null,
              "next": "outlet_power_source",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "motor_appliance",
              "label": "A fridge, freezer, or window air conditioner",
              "disclaimer": "These need a circuit of their own — a fridge that shares one with something else can be switched off by it without anyone noticing.",
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "heating_appliance",
              "label": "A microwave, a space heater, or a treadmill",
              "disclaimer": "These draw heavily enough that sharing a circuit tends to trip it.",
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "shop_equipment",
              "label": "A compressor, a table saw, or similar shop equipment",
              "disclaimer": "Equipment like this draws hard when it starts up.",
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "ev",
              "label": "An electric vehicle",
              "disclaimer": "That's a different job — we'll take you to the right place.",
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "unsure",
              "label": "Something else, or I'm not sure",
              "disclaimer": "Tell us what it is and send a photo of its label if you can find one — we'll work out what it needs and come back with a price.",
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            }
          ]
        },
        {
          "key": "outlet_power_source",
          "prompt": "How would you like it powered?",
          "helpText": null,
          "options": [
            {
              "value": "tap_existing",
              "label": "From the nearest outlet — from $280",
              "disclaimer": "The quickest way, and fine for everyday things. It shares a circuit with whatever else is already on it.",
              "next": "below_above_access",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "dedicated",
              "label": "Its own circuit from the panel — from $685",
              "disclaimer": "Worth it if the outlets nearby already trip, or you'd rather this one had room to spare.",
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            }
          ]
        },
        {
          "key": "below_above_access",
          "prompt": "Is there a basement (unfinished, or with a drop ceiling) or attic directly above or below where the outlet is going?",
          "helpText": "This is what determines whether we can run the wire without opening up your walls.",
          "options": [
            {
              "value": "has_access",
              "label": "Yes",
              "disclaimer": null,
              "next": "device_on_exterior_wall",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "no_access",
              "label": "No",
              "disclaimer": null,
              "next": "finished_space_both_sides",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            }
          ]
        },
        {
          "key": "finished_space_both_sides",
          "prompt": "Is there finished living space directly above and/or below this wall, or is the room on a slab?",
          "helpText": "Either way we'd be running the wire inside the finished wall. We're checking there's nothing unusual behind it.",
          "options": [
            {
              "value": "finished_both_sides",
              "label": "Yes — finished space above or below, or the room's on a slab",
              "disclaimer": null,
              "next": "outlet_finish_ack",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "exterior_wall",
              "label": "It's an exterior wall",
              "disclaimer": null,
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "unsure",
              "label": "I'm not sure",
              "disclaimer": null,
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            }
          ]
        },
        {
          "key": "device_on_exterior_wall",
          "prompt": "Is this going on an outside wall?",
          "helpText": "A wall with the outdoors on the other side, rather than another room. It changes how we get the wire there.",
          "options": [
            {
              "value": "exterior",
              "label": "Yes, it's an outside wall",
              "disclaimer": null,
              "next": "outlet_run_distance",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "interior",
              "label": "No, it's an interior wall",
              "disclaimer": null,
              "next": "outlet_run_distance",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "unsure",
              "label": "I'm not sure",
              "disclaimer": null,
              "next": "outlet_run_distance",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            }
          ]
        },
        {
          "key": "outlet_finish_ack",
          "prompt": "Before we price this — one thing about your walls",
          "helpText": "With no attic, basement or drop ceiling to work through, the wiring for this outlet has to be fished through finished walls.\n\nYour electrician will likely need to make one or more openings in the drywall or plaster to get the cable across. We keep them small and put them where they're least visible, but on a finished wall they usually can't be avoided entirely.\n\nPatching, spackling, sanding, painting, wallpaper and trim aren't included unless we've put it in writing.\n\nThat's why we asked about attic and basement access — an open route usually means no openings at all and less time on site.",
          "options": [
            {
              "value": "accepted",
              "label": "I understand — go ahead",
              "disclaimer": null,
              "next": "outlet_run_distance",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "review_first",
              "label": "I'd rather Voltmark take a look first",
              "disclaimer": null,
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            }
          ]
        },
        {
          "key": "outlet_run_distance",
          "prompt": "About how far is the new outlet from the power we'd run it from?",
          "helpText": "Roughly the path the wire would take — through the basement or attic, or across the wall — rather than the straight line across the room.",
          "options": [
            {
              "value": "under_10",
              "label": "Less than 10 feet",
              "disclaimer": null,
              "next": null,
              "price": {
                "cents": 12500,
                "needsReview": false,
                "perUnitCents": null,
                "settles": true
              }
            },
            {
              "value": "10_to_20",
              "label": "10 to 20 feet",
              "disclaimer": null,
              "next": null,
              "price": {
                "cents": 26000,
                "needsReview": false,
                "perUnitCents": null,
                "settles": true
              }
            },
            {
              "value": "over_20",
              "label": "More than 20 feet",
              "disclaimer": null,
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "unsure",
              "label": "I'm not sure",
              "disclaimer": null,
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            }
          ]
        }
      ],
      "outcomes": {
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"exterior\",\"outlet_run_distance\":\"under_10\"}": {
          "status": "PRICED",
          "priceCents": 28000,
          "disclaimers": [
            "The quickest way, and fine for everyday things. It shares a circuit with whatever else is already on it.",
            "One thing about exterior walls: they're harder to route through than interior ones because of insulation and framing, and we won't know for certain until we're there. Small drywall openings may be needed to get the wiring across. If that's what it takes, it adds $125 for a run under 10 feet or $190 for a longer one, and patching and painting aren't included. We'll show you what we're looking at and confirm before doing anything."
          ],
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"exterior\",\"outlet_run_distance\":\"10_to_20\"}": {
          "status": "PRICED",
          "priceCents": 35000,
          "disclaimers": [
            "The quickest way, and fine for everyday things. It shares a circuit with whatever else is already on it.",
            "One thing about exterior walls: they're harder to route through than interior ones because of insulation and framing, and we won't know for certain until we're there. Small drywall openings may be needed to get the wiring across. If that's what it takes, it adds $125 for a run under 10 feet or $190 for a longer one, and patching and painting aren't included. We'll show you what we're looking at and confirm before doing anything."
          ],
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"exterior\",\"outlet_run_distance\":\"over_20\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The wall where the new outlet is going, floor to ceiling",
            "The outlet or panel we'd be running the power from",
            "A wider photo of the room"
          ]
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"exterior\",\"outlet_run_distance\":\"unsure\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The wall where the new outlet is going, floor to ceiling",
            "The outlet or panel we'd be running the power from",
            "A wider photo of the room"
          ]
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"interior\",\"outlet_run_distance\":\"under_10\"}": {
          "status": "PRICED",
          "priceCents": 28000,
          "disclaimers": [
            "The quickest way, and fine for everyday things. It shares a circuit with whatever else is already on it."
          ],
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"interior\",\"outlet_run_distance\":\"10_to_20\"}": {
          "status": "PRICED",
          "priceCents": 35000,
          "disclaimers": [
            "The quickest way, and fine for everyday things. It shares a circuit with whatever else is already on it."
          ],
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"interior\",\"outlet_run_distance\":\"over_20\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The wall where the new outlet is going, floor to ceiling",
            "The outlet or panel we'd be running the power from",
            "A wider photo of the room"
          ]
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"interior\",\"outlet_run_distance\":\"unsure\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The wall where the new outlet is going, floor to ceiling",
            "The outlet or panel we'd be running the power from",
            "A wider photo of the room"
          ]
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"unsure\",\"outlet_run_distance\":\"under_10\"}": {
          "status": "PRICED",
          "priceCents": 28000,
          "disclaimers": [
            "The quickest way, and fine for everyday things. It shares a circuit with whatever else is already on it.",
            "One thing about exterior walls: they're harder to route through than interior ones because of insulation and framing, and we won't know for certain until we're there. Small drywall openings may be needed to get the wiring across. If that's what it takes, it adds $125 for a run under 10 feet or $190 for a longer one, and patching and painting aren't included. We'll show you what we're looking at and confirm before doing anything."
          ],
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"unsure\",\"outlet_run_distance\":\"10_to_20\"}": {
          "status": "PRICED",
          "priceCents": 35000,
          "disclaimers": [
            "The quickest way, and fine for everyday things. It shares a circuit with whatever else is already on it.",
            "One thing about exterior walls: they're harder to route through than interior ones because of insulation and framing, and we won't know for certain until we're there. Small drywall openings may be needed to get the wiring across. If that's what it takes, it adds $125 for a run under 10 feet or $190 for a longer one, and patching and painting aren't included. We'll show you what we're looking at and confirm before doing anything."
          ],
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"unsure\",\"outlet_run_distance\":\"over_20\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The wall where the new outlet is going, floor to ceiling",
            "The outlet or panel we'd be running the power from",
            "A wider photo of the room"
          ]
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"unsure\",\"outlet_run_distance\":\"unsure\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The wall where the new outlet is going, floor to ceiling",
            "The outlet or panel we'd be running the power from",
            "A wider photo of the room"
          ]
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"finished_both_sides\",\"outlet_finish_ack\":\"accepted\",\"outlet_run_distance\":\"under_10\"}": {
          "status": "PRICED",
          "priceCents": 40500,
          "disclaimers": [
            "The quickest way, and fine for everyday things. It shares a circuit with whatever else is already on it."
          ],
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"finished_both_sides\",\"outlet_finish_ack\":\"accepted\",\"outlet_run_distance\":\"10_to_20\"}": {
          "status": "PRICED",
          "priceCents": 54000,
          "disclaimers": [
            "The quickest way, and fine for everyday things. It shares a circuit with whatever else is already on it."
          ],
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"finished_both_sides\",\"outlet_finish_ack\":\"accepted\",\"outlet_run_distance\":\"over_20\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The wall where the new outlet is going, floor to ceiling",
            "The outlet or panel we'd be running the power from",
            "A wider photo of the room"
          ]
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"finished_both_sides\",\"outlet_finish_ack\":\"accepted\",\"outlet_run_distance\":\"unsure\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The wall where the new outlet is going, floor to ceiling",
            "The outlet or panel we'd be running the power from",
            "A wider photo of the room"
          ]
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"finished_both_sides\",\"outlet_finish_ack\":\"review_first\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The wall where the new outlet is going, floor to ceiling",
            "The outlet or panel we'd be running the power from",
            "A wider photo of the room"
          ]
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"exterior_wall\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The wall where the new outlet is going, floor to ceiling",
            "A wider photo of the room"
          ]
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"unsure\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The wall where the new outlet is going, floor to ceiling",
            "A wider photo of the room"
          ]
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"dedicated\"}": {
          "status": "REROUTE",
          "targetName": "Dedicated Circuit & Outlet",
          "targetKey": "dedicated-120v-circuit-outlet"
        },
        "{\"outlet_load_type\":\"motor_appliance\"}": {
          "status": "REROUTE",
          "targetName": "Dedicated Circuit & Outlet",
          "targetKey": "dedicated-120v-circuit-outlet"
        },
        "{\"outlet_load_type\":\"heating_appliance\"}": {
          "status": "REROUTE",
          "targetName": "Dedicated Circuit & Outlet",
          "targetKey": "dedicated-120v-circuit-outlet"
        },
        "{\"outlet_load_type\":\"shop_equipment\"}": {
          "status": "REROUTE",
          "targetName": "Dedicated Circuit & Outlet",
          "targetKey": "dedicated-120v-circuit-outlet"
        },
        "{\"outlet_load_type\":\"ev\"}": {
          "status": "REROUTE",
          "targetName": "Level 2 EV Charger Installation",
          "targetKey": "level-2-ev-charger"
        },
        "{\"outlet_load_type\":\"unsure\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The nameplate label on the appliance — usually a sticker on the back or underside"
          ]
        }
      }
    },
    "level-2-ev-charger": {
      "key": "level-2-ev-charger",
      "name": "Level 2 EV Charger Installation",
      "description": "Installing a Level 2 (240V) electric vehicle charger in your garage or driveway.",
      "steps": [
        {
          "key": "panel_distance",
          "prompt": "How far is your electrical panel from where the charger will be installed?",
          "helpText": null,
          "options": [
            {
              "value": "same_room",
              "label": "Same wall or room as the panel",
              "disclaimer": null,
              "next": "panel_capacity",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "same_floor",
              "label": "Same floor, different room",
              "disclaimer": null,
              "next": "panel_capacity",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "different_floor",
              "label": "Different floor",
              "disclaimer": null,
              "next": "panel_capacity",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "detached",
              "label": "Detached garage",
              "disclaimer": null,
              "next": "panel_capacity",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            }
          ]
        },
        {
          "key": "panel_capacity",
          "prompt": "Does your panel have an open double-pole breaker slot for the charger?",
          "helpText": null,
          "options": [
            {
              "value": "yes",
              "label": "Yes",
              "disclaimer": null,
              "next": "garage_type",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "no",
              "label": "No",
              "disclaimer": null,
              "next": "garage_type",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "unsure",
              "label": "I'm not sure",
              "disclaimer": null,
              "next": "garage_type",
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            }
          ]
        },
        {
          "key": "garage_type",
          "prompt": "Is this for an attached or detached garage, or an outdoor location like a driveway?",
          "helpText": null,
          "options": [
            {
              "value": "attached",
              "label": "Attached garage",
              "disclaimer": null,
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "detached_confirm",
              "label": "Detached garage",
              "disclaimer": null,
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            },
            {
              "value": "outdoor",
              "label": "Outdoor / driveway",
              "disclaimer": null,
              "next": null,
              "price": {
                "cents": 0,
                "needsReview": false,
                "perUnitCents": null,
                "settles": false
              }
            }
          ]
        }
      ],
      "outcomes": {
        "{\"panel_distance\":\"same_room\",\"panel_capacity\":\"yes\",\"garage_type\":\"attached\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_room\",\"panel_capacity\":\"yes\",\"garage_type\":\"detached_confirm\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_room\",\"panel_capacity\":\"yes\",\"garage_type\":\"outdoor\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_room\",\"panel_capacity\":\"no\",\"garage_type\":\"attached\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_room\",\"panel_capacity\":\"no\",\"garage_type\":\"detached_confirm\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_room\",\"panel_capacity\":\"no\",\"garage_type\":\"outdoor\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_room\",\"panel_capacity\":\"unsure\",\"garage_type\":\"attached\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_room\",\"panel_capacity\":\"unsure\",\"garage_type\":\"detached_confirm\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_room\",\"panel_capacity\":\"unsure\",\"garage_type\":\"outdoor\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_floor\",\"panel_capacity\":\"yes\",\"garage_type\":\"attached\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_floor\",\"panel_capacity\":\"yes\",\"garage_type\":\"detached_confirm\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_floor\",\"panel_capacity\":\"yes\",\"garage_type\":\"outdoor\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_floor\",\"panel_capacity\":\"no\",\"garage_type\":\"attached\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_floor\",\"panel_capacity\":\"no\",\"garage_type\":\"detached_confirm\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_floor\",\"panel_capacity\":\"no\",\"garage_type\":\"outdoor\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_floor\",\"panel_capacity\":\"unsure\",\"garage_type\":\"attached\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_floor\",\"panel_capacity\":\"unsure\",\"garage_type\":\"detached_confirm\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"same_floor\",\"panel_capacity\":\"unsure\",\"garage_type\":\"outdoor\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"different_floor\",\"panel_capacity\":\"yes\",\"garage_type\":\"attached\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"different_floor\",\"panel_capacity\":\"yes\",\"garage_type\":\"detached_confirm\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"different_floor\",\"panel_capacity\":\"yes\",\"garage_type\":\"outdoor\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"different_floor\",\"panel_capacity\":\"no\",\"garage_type\":\"attached\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"different_floor\",\"panel_capacity\":\"no\",\"garage_type\":\"detached_confirm\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"different_floor\",\"panel_capacity\":\"no\",\"garage_type\":\"outdoor\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"different_floor\",\"panel_capacity\":\"unsure\",\"garage_type\":\"attached\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"different_floor\",\"panel_capacity\":\"unsure\",\"garage_type\":\"detached_confirm\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"different_floor\",\"panel_capacity\":\"unsure\",\"garage_type\":\"outdoor\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"detached\",\"panel_capacity\":\"yes\",\"garage_type\":\"attached\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"detached\",\"panel_capacity\":\"yes\",\"garage_type\":\"detached_confirm\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"detached\",\"panel_capacity\":\"yes\",\"garage_type\":\"outdoor\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"detached\",\"panel_capacity\":\"no\",\"garage_type\":\"attached\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"detached\",\"panel_capacity\":\"no\",\"garage_type\":\"detached_confirm\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"detached\",\"panel_capacity\":\"no\",\"garage_type\":\"outdoor\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"detached\",\"panel_capacity\":\"unsure\",\"garage_type\":\"attached\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"detached\",\"panel_capacity\":\"unsure\",\"garage_type\":\"detached_confirm\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        },
        "{\"panel_distance\":\"detached\",\"panel_capacity\":\"unsure\",\"garage_type\":\"outdoor\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "Panel with the door open, showing the amp rating and breakers",
            "Where the charger will be mounted",
            "Path between the panel and the charger location (for run distance)"
          ]
        }
      }
    }
  },
  "addOns": [
    {
      "name": "Replace Standard Outlet",
      "priceCents": 9500
    },
    {
      "name": "Replace hardwired Smoke Detector",
      "priceCents": 9500
    },
    {
      "name": "Replace GFCI Outlet",
      "priceCents": 11500
    }
  ],
  "schedule": {
    "dayStart": "08:00",
    "dayEnd": "16:30",
    "windowMinutes": 180
  }
} as const;
