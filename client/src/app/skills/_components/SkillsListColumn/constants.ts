import type { SkillType } from "@devdigest/shared";

/** Defaults for "Add Skill → Create from scratch" — the user edits everything
 *  in place on the new skill's Config tab immediately after creation. */
export const DEFAULT_NEW_SKILL: { name: string; type: SkillType; body: string } = {
  name: "New Skill",
  type: "custom",
  body: "# New Skill\n\nDescribe the rule — write it directively: WHEN should a reviewing agent apply it?",
};
