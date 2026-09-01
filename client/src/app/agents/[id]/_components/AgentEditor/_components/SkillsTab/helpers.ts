import type { AgentSkillLink } from "@devdigest/shared";

/**
 * Pure helper for SkillsTab. Builds the initial row order — the ONLY time this
 * runs is on first load (the component seeds its state once, then owns
 * ordering itself via drag). Linked skills come first, in their persisted
 * `order`; skills not yet linked follow, in catalog order — there is nothing
 * to persist for an unlinked row's position, so this is just a stable
 * starting layout, not a rule the UI keeps re-deriving.
 */
export function initialOrder(allSkillIds: string[], links: AgentSkillLink[]): string[] {
  const linked = [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
  const linkedSet = new Set(linked);
  const rest = allSkillIds.filter((id) => !linkedSet.has(id));
  return [...linked, ...rest];
}
