import { SKILL_SOURCE_ICON, SKILL_TYPE_STYLE, NEEDS_VETTING_SOURCES } from "./constants";
import type { Skill } from "@devdigest/shared";

export function typeStyle(type: Skill["type"]) {
  return SKILL_TYPE_STYLE[type];
}

export function sourceIcon(source: Skill["source"]) {
  return SKILL_SOURCE_ICON[source];
}

/** A non-manual skill hasn't been written by hand in this workspace — its body
 *  is someone else's instructions until a human reviews and enables it. */
export function needsVetting(skill: Skill): boolean {
  return NEEDS_VETTING_SOURCES.includes(skill.source);
}
