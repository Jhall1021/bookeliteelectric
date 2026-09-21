export function isReviewedAccessibleNewCeilingLight(answers: Record<string, string | undefined>): boolean {
  return ["under_8", "9_10", "11_12"].includes(answers.fixture_height ?? "")
    && ["level_floor", "open_room_level"].includes(answers.work_area_below ?? "")
    && answers.attic_access === "has_access"
    && answers.existing_light_source === "yes"
    && answers.lighting_control === "existing_switched_light"
    && answers.lighting_dimmer_upgrade === "standard";
}

export function isReviewedAccessibleNewCeilingFan(answers: Record<string, string | undefined>): boolean {
  return isReviewedAccessibleNewCeilingLight(answers);
}
