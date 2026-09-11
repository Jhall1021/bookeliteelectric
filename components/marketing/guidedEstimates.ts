/**
 * GENERATED — do not edit by hand.
 *
 * What Guided Estimates does, measured from the product: live services of
 * active contractors, verifier fixtures excluded. The page that reads this
 * may not claim anything the capture does not contain.
 *
 * Re-capture:      npx tsx scripts/capture-guided-estimates.ts
 * Capability check: npx tsx scripts/capture-guided-estimates.ts --check   (any database)
 * Exact audit:      npx tsx scripts/capture-guided-estimates.ts --audit   (production only)
 */
export const GUIDED_ESTIMATES = {
  "generatedBy": "scripts/capture-guided-estimates.ts",
  "capturedAt": "2026-09-11",
  "identity": "Voltmark Electric",
  "scope": "live services of active contractors; verifier fixtures excluded (lib/fixtureContractors.ts); quotes are history",
  "bookingTypes": {
    "INSTANT": 27,
    "TROUBLESHOOT_ONLY": 2,
    "REMOTE_QUOTE": 1,
    "ADJUSTED": 39
  },
  "remoteQuote": {
    "services": 1,
    "withoutPublishedPrice": 1,
    "categories": [
      "EV & Garage"
    ]
  },
  "routes": {
    "PHOTO_REVIEW": 269
  },
  "photos": {
    "distinctLabels": 72,
    "labels": [
      "A close photo of the breakers, so we can read the numbers on them",
      "A wider photo of that exterior wall",
      "A wider photo of the bathroom ceiling",
      "A wider photo of the room",
      "A wider photo of the whole room",
      "A wider photo of the whole room including the floor below",
      "Any other switches in the room that might control the same light",
      "Breaker directory/label, if there is one",
      "Ceiling area where the fan will be installed",
      "Ceiling area where the fixture will be installed",
      "Close up of exactly where you'd like the camera",
      "Close-up of the wall surface/texture",
      "Current thermostat with the cover removed, showing the wiring",
      "Electrical panel with the door open and breakers visible — leave the panel cover on",
      "Fireplace and surrounding wall, full width",
      "Full wall where the TV is going",
      "Inside that same wall, where the power would come from",
      "Nearest attic or basement access point, if any",
      "Nearest attic or basement access, if any",
      "Panel with the door open",
      "Panel with the door open, showing the amp rating and breakers",
      "Path between the panel and the charger location (for run distance)",
      "Room where the fan is going, full view",
      "Room where the light is going, full view",
      "The TV, or its model number if it's still boxed",
      "The area directly below the fixture — stairs, railing, or whatever is in the way",
      "The attic hatch, basement stairs or crawlspace opening, if you have one",
      "The attic or basement above or below, if you have one",
      "The attic, unfinished basement, or drop-ceiling route the wire will travel",
      "The cabinets that need light, and the wall underneath them",
      "The ceiling around it",
      "The ceiling location where the new light or fan will go",
      "The ceiling where the light or fan is going",
      "The doorway from outside, showing the door frame and the surrounding wall",
      "The equipment or appliance, including the model or label if it's safely visible",
      "The existing fan, cover on, from below",
      "The existing fixture, from below",
      "The fan you have now",
      "The fixture or work area, taken from floor level so we can judge the height",
      "The garage wall where the outlet should go",
      "The indoor outlet on the other side of that wall",
      "The inside of that same wall, wherever the nearest outlet is",
      "The label inside the panel door, showing its brand and model",
      "The meter from outside, and the wires coming down to it",
      "The nameplate label on the appliance — usually a sticker on the back or underside",
      "The nearest outlet on that wall",
      "The nearest outlet or switch below those cabinets",
      "The new chandelier — a photo, or a screenshot of the product page",
      "The outlet or panel we'd be running the power from",
      "The plug on your equipment, showing its prongs",
      "The room from a distance, showing the ceiling and the floor beneath it",
      "The rooms in between, and the ceiling or floor between them if you can",
      "The switch you want replaced, plate on — please don't remove it",
      "The wall switch in question, plate on — please don't remove it",
      "The wall where it's going, full height",
      "The wall where the TV is going, full height",
      "The wall where the new outlet is going, floor to ceiling",
      "The whole side of the house, standing well back",
      "Wall or location where the new dedicated outlet will go",
      "Wall where the TV and outlet are needed, full height",
      "Wall where the outlet is needed, full height",
      "Where the charger will be mounted",
      "Where the line starts — the router, modem, or the existing cable box",
      "Where the tub sits, and the wall between it and the panel",
      "Where the wires from the street attach to the house",
      "Where you'd like the new jack to come out",
      "Where you'd like the outdoor outlet, with enough of the wall around it to see the siding",
      "Where you'd like the outdoor outlet, with enough wall around it to see the siding",
      "Where your electrical panel is, with the cover on",
      "Wide photo of the room or area",
      "Wide photo of the whole wall and area around the electrical panel",
      "Your panel with the OUTER DOOR open, showing the row of breakers"
    ],
    "blocking": 235,
    "preparation": 13
  },
  "example": {
    "serviceName": "Level 2 EV Charger Installation",
    "prompt": "Is this for an attached or detached garage, or an outdoor location like a driveway?",
    "answer": "Attached garage",
    "routeAction": "PHOTO_REVIEW",
    "bookingType": "REMOTE_QUOTE",
    "photoLabels": [
      "Panel with the door open, showing the amp rating and breakers",
      "Where the charger will be mounted",
      "Path between the panel and the charger location (for run distance)"
    ],
    "blocksBooking": true
  },
  "quotes": {
    "total": 2,
    "byStatus": {
      "PRICED": 2
    }
  }
} as const;
