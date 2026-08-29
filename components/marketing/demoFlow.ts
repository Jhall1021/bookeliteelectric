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
 *   npx tsx scripts/capture-demo-flow.ts --service replace-range-hood
 *   npx tsx scripts/demo-contractor.ts --destroy
 */
export const DEMO_FLOW = {
  "generatedBy": "scripts/capture-demo-flow.ts",
  "contractor": "Voltmark Electric",
  "note": "A demonstration contractor. Every price and routing decision below was produced by the real pricing engine and route resolver.",
  "search": {
    "query": "the vent hood over my stove needs replacing",
    "serviceName": "Replace Existing Range Hood",
    "matchKind": "suggestion"
  },
  "service": {
    "name": "Replace Existing Range Hood",
    "description": "We remove your old range hood, mount the replacement you've bought, reconnect the power and the existing ducting, and test it. For an existing hood in the same spot using the same venting."
  },
  "steps": [
    {
      "key": "hood_exists",
      "prompt": "Is there a range hood there now?",
      "helpText": null,
      "options": [
        {
          "value": "yes",
          "label": "Yes, there's one there now",
          "disclaimer": null,
          "next": "hood_has_power"
        },
        {
          "value": "no",
          "label": "No, this would be a new hood location",
          "disclaimer": null,
          "next": null
        }
      ]
    },
    {
      "key": "hood_has_power",
      "prompt": "Does the current hood work — fan and light?",
      "helpText": "We're checking that the power to it is good, not whether you like it.",
      "options": [
        {
          "value": "works",
          "label": "Yes, it works",
          "disclaimer": null,
          "next": "hood_venting"
        },
        {
          "value": "no_power",
          "label": "No, it has no power",
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
      "key": "hood_venting",
      "prompt": "How does the current hood vent?",
      "helpText": "If you can't tell, that's fine — say so and we'll take a look.",
      "options": [
        {
          "value": "through_wall",
          "label": "Out through the wall",
          "disclaimer": null,
          "next": "hood_same_size"
        },
        {
          "value": "through_cabinet",
          "label": "Up through the cabinet or ceiling",
          "disclaimer": null,
          "next": "hood_same_size"
        },
        {
          "value": "recirculating",
          "label": "It doesn't vent outside — it recirculates",
          "disclaimer": null,
          "next": "hood_same_size"
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
      "key": "hood_same_size",
      "prompt": "Is the new hood about the same size and type, going in the same spot?",
      "helpText": null,
      "options": [
        {
          "value": "same",
          "label": "Yes, same size and same spot",
          "disclaimer": null,
          "next": "hood_backsplash"
        },
        {
          "value": "different",
          "label": "No, it's different",
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
      "key": "hood_backsplash",
      "prompt": "Will the new hood use the same mounting spot, or do we need to drill or cut into the backsplash or wall?",
      "helpText": null,
      "options": [
        {
          "value": "same_mounting",
          "label": "Same spot — nothing needs cutting",
          "disclaimer": null,
          "next": null
        },
        {
          "value": "needs_cutting",
          "label": "We'd need to cut or drill the backsplash or wall",
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
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"through_wall\",\"hood_same_size\":\"same\",\"hood_backsplash\":\"same_mounting\"}": {
      "status": "PRICED",
      "priceCents": 43000,
      "disclaimers": [],
      "photoLabels": []
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"through_wall\",\"hood_same_size\":\"same\",\"hood_backsplash\":\"needs_cutting\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"through_wall\",\"hood_same_size\":\"same\",\"hood_backsplash\":\"unsure\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"through_wall\",\"hood_same_size\":\"different\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area",
        "The equipment or appliance, including its model or rating label if you can see it safely"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"through_wall\",\"hood_same_size\":\"unsure\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area",
        "The equipment or appliance, including its model or rating label if you can see it safely"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"through_cabinet\",\"hood_same_size\":\"same\",\"hood_backsplash\":\"same_mounting\"}": {
      "status": "PRICED",
      "priceCents": 43000,
      "disclaimers": [],
      "photoLabels": []
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"through_cabinet\",\"hood_same_size\":\"same\",\"hood_backsplash\":\"needs_cutting\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"through_cabinet\",\"hood_same_size\":\"same\",\"hood_backsplash\":\"unsure\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"through_cabinet\",\"hood_same_size\":\"different\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area",
        "The equipment or appliance, including its model or rating label if you can see it safely"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"through_cabinet\",\"hood_same_size\":\"unsure\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area",
        "The equipment or appliance, including its model or rating label if you can see it safely"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"recirculating\",\"hood_same_size\":\"same\",\"hood_backsplash\":\"same_mounting\"}": {
      "status": "PRICED",
      "priceCents": 43000,
      "disclaimers": [],
      "photoLabels": []
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"recirculating\",\"hood_same_size\":\"same\",\"hood_backsplash\":\"needs_cutting\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"recirculating\",\"hood_same_size\":\"same\",\"hood_backsplash\":\"unsure\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"recirculating\",\"hood_same_size\":\"different\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area",
        "The equipment or appliance, including its model or rating label if you can see it safely"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"recirculating\",\"hood_same_size\":\"unsure\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area",
        "The equipment or appliance, including its model or rating label if you can see it safely"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"works\",\"hood_venting\":\"unsure\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"no_power\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area",
        "Your electrical panel with the door open and the breakers visible",
        "A wider photo of the whole wall around the panel"
      ]
    },
    "{\"hood_exists\":\"yes\",\"hood_has_power\":\"unsure\"}": {
      "status": "REVIEW",
      "reason": "This route needs the office to price it",
      "photoLabels": [
        "The spot where the work is going",
        "A wider photo of the whole room or area"
      ]
    },
    "{\"hood_exists\":\"no\"}": {
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
