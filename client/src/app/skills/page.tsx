import { SkillsView } from "./_components/SkillsView";

/* Route: /skills (Skills list, no selection). Thin route entry — the view,
   its list column, card, detail tabs, styles, constants and i18n are
   colocated under _components/. */
export default function SkillsPage() {
  return <SkillsView />;
}
