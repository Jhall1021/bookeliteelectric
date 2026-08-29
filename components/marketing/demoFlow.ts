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
  "service": {
    "name": "Customer-Supplied Soundbar Installation",
    "description": "Mounting a soundbar below your TV or on a shelf, with cable concealment."
  },
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
      "targetName": "New 120V Outlet"
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
      "targetName": "Install TV in Existing Location"
    },
    "{\"soundbar_tv_mounted\":\"on_furniture\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area"
      ]
    }
  },
  "addOns": [
    {
      "name": "Smart Thermostat Installation",
      "priceCents": 11500
    },
    {
      "name": "Video Doorbell — Existing Wiring",
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
