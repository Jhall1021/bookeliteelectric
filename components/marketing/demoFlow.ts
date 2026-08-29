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
 *   npx tsx scripts/capture-demo-flow.ts --service soundbar-installation
 *   npx tsx scripts/demo-contractor.ts --destroy
 */
export const DEMO_FLOW = {
  "generatedBy": "scripts/capture-demo-flow.ts",
  "contractor": "Voltmark Electric",
  "note": "A demonstration contractor. Every price and routing decision below was produced by the real pricing engine and route resolver.",
  "search": {
    "query": "I bought a soundbar and need it mounted under my TV",
    "serviceName": "Customer-Supplied Soundbar Installation",
    "matchKind": "suggestion"
  },
  "primary": "soundbar-installation",
  "flows": {
    "soundbar-installation": {
      "key": "soundbar-installation",
      "name": "Customer-Supplied Soundbar Installation",
      "description": "Mounting a soundbar below your TV or on a shelf, with cable concealment.",
      "steps": [
        {
          "key": "soundbar_tv_mounted",
          "prompt": "Is your TV already mounted on the wall?",
          "helpText": null,
          "options": [
            {
              "value": "mounted",
              "label": "Yes, it's already on the wall",
              "disclaimer": null,
              "next": "soundbar_location"
            },
            {
              "value": "needs_tv_mount",
              "label": "No — I need the TV mounted too",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "on_furniture",
              "label": "The TV sits on furniture",
              "disclaimer": null,
              "next": null
            }
          ]
        },
        {
          "key": "soundbar_location",
          "prompt": "Where should the soundbar go?",
          "helpText": null,
          "options": [
            {
              "value": "wall_below_tv",
              "label": "On the wall below the TV",
              "disclaimer": null,
              "next": "soundbar_wall"
            },
            {
              "value": "on_tv_mount",
              "label": "Attached to the TV or its mount",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "other",
              "label": "Somewhere else, or I'm not sure",
              "disclaimer": null,
              "next": null
            }
          ]
        },
        {
          "key": "soundbar_wall",
          "prompt": "What's the wall made of?",
          "helpText": "If you're not certain, say so — we'd rather look than guess.",
          "options": [
            {
              "value": "drywall",
              "label": "Drywall",
              "disclaimer": null,
              "next": "soundbar_power"
            },
            {
              "value": "plaster",
              "label": "Plaster",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "masonry",
              "label": "Brick or concrete",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "tile_stone",
              "label": "Tile or stone",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "other",
              "label": "Something else, or I'm not sure",
              "disclaimer": null,
              "next": null
            }
          ]
        },
        {
          "key": "soundbar_power",
          "prompt": "Is there an outlet near where the soundbar will go?",
          "helpText": null,
          "options": [
            {
              "value": "yes",
              "label": "Yes",
              "disclaimer": null,
              "next": "soundbar_cable"
            },
            {
              "value": "no",
              "label": "No",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "unsure",
              "label": "I'm not sure",
              "disclaimer": null,
              "next": null
            }
          ]
        },
        {
          "key": "soundbar_cable",
          "prompt": "Do you have the cable to connect it to the TV?",
          "helpText": "HDMI or optical, whichever your soundbar uses.",
          "options": [
            {
              "value": "hdmi",
              "label": "Yes, HDMI",
              "disclaimer": null,
              "next": "soundbar_conceal"
            },
            {
              "value": "optical",
              "label": "Yes, optical",
              "disclaimer": null,
              "next": "soundbar_conceal"
            },
            {
              "value": "unsure_type",
              "label": "I have one but I'm not sure which",
              "disclaimer": null,
              "next": "soundbar_conceal"
            },
            {
              "value": "none",
              "label": "No, I don't have one",
              "disclaimer": null,
              "next": "soundbar_conceal"
            }
          ]
        },
        {
          "key": "soundbar_conceal",
          "prompt": "Would you like the cable hidden inside the wall?",
          "helpText": "Included either way — we just need to know before we start.",
          "options": [
            {
              "value": "conceal",
              "label": "Yes, hide it in the wall",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "surface",
              "label": "No, leave it outside the wall",
              "disclaimer": null,
              "next": null
            }
          ]
        }
      ],
      "outcomes": {
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"drywall\",\"soundbar_power\":\"yes\",\"soundbar_cable\":\"hdmi\",\"soundbar_conceal\":\"conceal\"}": {
          "status": "PRICED",
          "priceCents": 42000,
          "disclaimers": [],
          "photoLabels": []
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"drywall\",\"soundbar_power\":\"yes\",\"soundbar_cable\":\"hdmi\",\"soundbar_conceal\":\"surface\"}": {
          "status": "PRICED",
          "priceCents": 28000,
          "disclaimers": [],
          "photoLabels": []
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"drywall\",\"soundbar_power\":\"yes\",\"soundbar_cable\":\"optical\",\"soundbar_conceal\":\"conceal\"}": {
          "status": "PRICED",
          "priceCents": 42000,
          "disclaimers": [],
          "photoLabels": []
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"drywall\",\"soundbar_power\":\"yes\",\"soundbar_cable\":\"optical\",\"soundbar_conceal\":\"surface\"}": {
          "status": "PRICED",
          "priceCents": 28000,
          "disclaimers": [],
          "photoLabels": []
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"drywall\",\"soundbar_power\":\"yes\",\"soundbar_cable\":\"unsure_type\",\"soundbar_conceal\":\"conceal\"}": {
          "status": "PRICED",
          "priceCents": 42000,
          "disclaimers": [],
          "photoLabels": []
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"drywall\",\"soundbar_power\":\"yes\",\"soundbar_cable\":\"unsure_type\",\"soundbar_conceal\":\"surface\"}": {
          "status": "PRICED",
          "priceCents": 28000,
          "disclaimers": [],
          "photoLabels": []
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"drywall\",\"soundbar_power\":\"yes\",\"soundbar_cable\":\"none\",\"soundbar_conceal\":\"conceal\"}": {
          "status": "PRICED",
          "priceCents": 46500,
          "disclaimers": [],
          "photoLabels": []
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"drywall\",\"soundbar_power\":\"yes\",\"soundbar_cable\":\"none\",\"soundbar_conceal\":\"surface\"}": {
          "status": "PRICED",
          "priceCents": 32500,
          "disclaimers": [],
          "photoLabels": []
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"drywall\",\"soundbar_power\":\"no\"}": {
          "status": "REROUTE",
          "targetName": "New 120V Outlet",
          "targetKey": "new-120v-outlet"
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"drywall\",\"soundbar_power\":\"unsure\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The spot where the work is going",
            "A wider photo of the whole room or area"
          ]
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"plaster\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The spot where the work is going",
            "A wider photo of the whole room or area"
          ]
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"masonry\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The spot where the work is going",
            "A wider photo of the whole room or area"
          ]
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"tile_stone\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The spot where the work is going",
            "A wider photo of the whole room or area"
          ]
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"wall_below_tv\",\"soundbar_wall\":\"other\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The spot where the work is going",
            "A wider photo of the whole room or area"
          ]
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"on_tv_mount\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The spot where the work is going",
            "A wider photo of the whole room or area",
            "The equipment or appliance, including its model or rating label if you can see it safely"
          ]
        },
        "{\"soundbar_tv_mounted\":\"mounted\",\"soundbar_location\":\"other\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The spot where the work is going",
            "A wider photo of the whole room or area"
          ]
        },
        "{\"soundbar_tv_mounted\":\"needs_tv_mount\"}": {
          "status": "REROUTE",
          "targetName": "Install TV in Existing Location",
          "targetKey": "tv-install-existing-location"
        },
        "{\"soundbar_tv_mounted\":\"on_furniture\"}": {
          "status": "REVIEW",
          "reason": "This route needs the office to price it",
          "photoLabels": [
            "The spot where the work is going",
            "A wider photo of the whole room or area"
          ]
        }
      }
    },
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
              "next": "outlet_power_source"
            },
            {
              "value": "motor_appliance",
              "label": "A fridge, freezer, or window air conditioner",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "heating_appliance",
              "label": "A microwave, a space heater, or a treadmill",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "shop_equipment",
              "label": "A compressor, a table saw, or similar shop equipment",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "ev",
              "label": "An electric vehicle",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "unsure",
              "label": "Something else, or I'm not sure",
              "disclaimer": null,
              "next": null
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
              "label": "From the nearest outlet",
              "disclaimer": null,
              "next": "below_above_access"
            },
            {
              "value": "dedicated",
              "label": "Its own circuit from the panel",
              "disclaimer": null,
              "next": null
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
              "next": "device_on_exterior_wall"
            },
            {
              "value": "no_access",
              "label": "No",
              "disclaimer": null,
              "next": "finished_space_both_sides"
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
              "next": "outlet_finish_ack"
            },
            {
              "value": "exterior_wall",
              "label": "It's an exterior wall",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "unsure",
              "label": "I'm not sure",
              "disclaimer": null,
              "next": null
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
              "next": "outlet_run_distance"
            },
            {
              "value": "interior",
              "label": "No, it's an interior wall",
              "disclaimer": null,
              "next": "outlet_run_distance"
            },
            {
              "value": "unsure",
              "label": "I'm not sure",
              "disclaimer": null,
              "next": "outlet_run_distance"
            }
          ]
        },
        {
          "key": "outlet_finish_ack",
          "prompt": "Before we price this — one thing about your walls",
          "helpText": "With no attic, basement or drop ceiling to work through, the wiring for this outlet has to be fished through finished walls.\n\nYour electrician will likely need to make one or more openings in the drywall or plaster to get the cable across. We keep them small and put them where they're least visible, but on a finished wall they usually can't be avoided entirely.\n\nThat's why we asked about attic and basement access — an open route usually means no openings at all and less time on site.",
          "options": [
            {
              "value": "accepted",
              "label": "I understand — go ahead",
              "disclaimer": null,
              "next": "outlet_run_distance"
            },
            {
              "value": "review_first",
              "label": "I'd rather someone take a look first",
              "disclaimer": null,
              "next": null
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
              "label": "Less than {b1} feet",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "10_to_20",
              "label": "{b1} to {b2} feet",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "over_20",
              "label": "More than {b2} feet",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "unsure",
              "label": "I'm not sure",
              "disclaimer": null,
              "next": null
            }
          ]
        }
      ],
      "outcomes": {
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"exterior\",\"outlet_run_distance\":\"under_10\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"exterior\",\"outlet_run_distance\":\"10_to_20\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"exterior\",\"outlet_run_distance\":\"over_20\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"exterior\",\"outlet_run_distance\":\"unsure\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"interior\",\"outlet_run_distance\":\"under_10\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"interior\",\"outlet_run_distance\":\"10_to_20\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"interior\",\"outlet_run_distance\":\"over_20\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"interior\",\"outlet_run_distance\":\"unsure\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"unsure\",\"outlet_run_distance\":\"under_10\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"unsure\",\"outlet_run_distance\":\"10_to_20\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"unsure\",\"outlet_run_distance\":\"over_20\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"has_access\",\"device_on_exterior_wall\":\"unsure\",\"outlet_run_distance\":\"unsure\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"finished_both_sides\",\"outlet_finish_ack\":\"accepted\",\"outlet_run_distance\":\"under_10\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"finished_both_sides\",\"outlet_finish_ack\":\"accepted\",\"outlet_run_distance\":\"10_to_20\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"finished_both_sides\",\"outlet_finish_ack\":\"accepted\",\"outlet_run_distance\":\"over_20\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"finished_both_sides\",\"outlet_finish_ack\":\"accepted\",\"outlet_run_distance\":\"unsure\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"finished_both_sides\",\"outlet_finish_ack\":\"review_first\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"exterior_wall\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"tap_existing\",\"below_above_access\":\"no_access\",\"finished_space_both_sides\":\"unsure\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"everyday\",\"outlet_power_source\":\"dedicated\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"motor_appliance\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"heating_appliance\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"shop_equipment\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"ev\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        },
        "{\"outlet_load_type\":\"unsure\"}": {
          "status": "REVIEW",
          "reason": "A material this service needs has no cost recorded",
          "photoLabels": []
        }
      }
    },
    "tv-install-existing-location": {
      "key": "tv-install-existing-location",
      "name": "Install TV in Existing Location",
      "description": "Mounting your TV where power and cable routing are already in place — no new outlet or cable concealment needed, so it's faster and less expensive than a full installation.",
      "steps": [
        {
          "key": "tv_size",
          "prompt": "What size is your TV?",
          "helpText": "Measure corner to corner on the front of your TV.",
          "options": [
            {
              "value": "up_to_55",
              "label": "Up to 55\"",
              "disclaimer": null,
              "next": "mount_supplied"
            },
            {
              "value": "56_100",
              "label": "56\"–100\"",
              "disclaimer": null,
              "next": "mount_supplied"
            }
          ]
        },
        {
          "key": "mount_supplied",
          "prompt": "Are you supplying your own mount?",
          "helpText": null,
          "options": [
            {
              "value": "yes",
              "label": "Yes, I have my own mount",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "no",
              "label": "No, I need a mount",
              "disclaimer": null,
              "next": "mount_type"
            }
          ]
        },
        {
          "key": "mount_type",
          "prompt": "What type of mount would you like?",
          "helpText": null,
          "options": [
            {
              "value": "tilt",
              "label": "Tilt mount supplied by your electrician",
              "disclaimer": null,
              "next": null
            },
            {
              "value": "articulating",
              "label": "Full-motion mount supplied by your electrician",
              "disclaimer": null,
              "next": null
            }
          ]
        }
      ],
      "outcomes": {
        "{\"tv_size\":\"up_to_55\",\"mount_supplied\":\"yes\"}": {
          "status": "PRICED",
          "priceCents": 26000,
          "disclaimers": [],
          "photoLabels": []
        },
        "{\"tv_size\":\"up_to_55\",\"mount_supplied\":\"no\",\"mount_type\":\"tilt\"}": {
          "status": "PRICED",
          "priceCents": 26000,
          "disclaimers": [],
          "photoLabels": []
        },
        "{\"tv_size\":\"up_to_55\",\"mount_supplied\":\"no\",\"mount_type\":\"articulating\"}": {
          "status": "PRICED",
          "priceCents": 26000,
          "disclaimers": [],
          "photoLabels": []
        },
        "{\"tv_size\":\"56_100\",\"mount_supplied\":\"yes\"}": {
          "status": "PRICED",
          "priceCents": 26000,
          "disclaimers": [],
          "photoLabels": []
        },
        "{\"tv_size\":\"56_100\",\"mount_supplied\":\"no\",\"mount_type\":\"tilt\"}": {
          "status": "PRICED",
          "priceCents": 26000,
          "disclaimers": [],
          "photoLabels": []
        },
        "{\"tv_size\":\"56_100\",\"mount_supplied\":\"no\",\"mount_type\":\"articulating\"}": {
          "status": "PRICED",
          "priceCents": 26000,
          "disclaimers": [],
          "photoLabels": []
        }
      }
    }
  },
  "addOns": [
    {
      "name": "Video Doorbell — Existing Wiring",
      "priceCents": 11500
    },
    {
      "name": "Smart Thermostat Installation",
      "priceCents": 11500
    },
    {
      "name": "Garbage Disposal Electrical Disconnect / Reconnect",
      "priceCents": 15500
    }
  ],
  "schedule": {
    "dayStart": "08:00",
    "dayEnd": "16:30",
    "windowMinutes": 180
  }
} as const;
