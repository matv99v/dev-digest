/* SkillsTab — attach/detach/reorder/toggle this agent's linked skills.
   Order matters (earlier = earlier in the assembled prompt); every action
   (reorder, toggle, link, unlink) sends the FULL ordered set in one call —
   POST /agents/:id/skills is a full-replace endpoint, not incremental. The
   filter box is local-only UI state and never triggers a request. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Dropdown, EmptyState, IconBtn } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: links, isLoading: linksLoading } = useAgentSkills(agent.id);
  const { data: allSkills, isLoading: skillsLoading } = useSkills();
  const setSkills = useSetAgentSkills();
  const [filter, setFilter] = React.useState("");
  // Every hook must run on every render (Rules of Hooks) — this ref is used
  // below, but declared here, BEFORE the loading early-return, so its
  // presence doesn't depend on whether links/allSkills have loaded yet.
  const dragIndex = React.useRef<number | null>(null);

  if (linksLoading || skillsLoading || !links || !allSkills) return null;

  const skillsById = new Map(allSkills.map((sk) => [sk.id, sk]));
  const ordered = [...links].sort((a, b) => a.order - b.order);

  const enabledCount = ordered.filter((l) => l.enabled && skillsById.get(l.skill_id)?.enabled).length;

  const send = (entries: { skill_id: string; enabled?: boolean }[]) =>
    setSkills.mutate({ agentId: agent.id, skills: entries });

  const toEntries = (list: typeof ordered) =>
    list.map((l) => ({ skill_id: l.skill_id, enabled: l.enabled }));

  const toggle = (skillId: string) =>
    send(toEntries(ordered.map((l) => (l.skill_id === skillId ? { ...l, enabled: !l.enabled } : l))));

  const move = (index: number, delta: number) => {
    const next = [...ordered];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    send(toEntries(next));
  };

  const unlink = (skillId: string) => send(toEntries(ordered.filter((l) => l.skill_id !== skillId)));

  const linkSkill = (skillId: string) => send([...toEntries(ordered), { skill_id: skillId, enabled: true }]);

  const visible = ordered.filter((l) => {
    const name = skillsById.get(l.skill_id)?.name ?? "";
    return name.toLowerCase().includes(filter.trim().toLowerCase());
  });

  const unlinked = allSkills.filter((sk) => !ordered.some((l) => l.skill_id === sk.id));

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)">
          {t("skills.enabledCount", { linked: enabledCount, total: ordered.length })}
        </Badge>
      </div>

      <div style={s.filterRow}>
        <input
          style={s.filterInput}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("skills.filterPlaceholder")}
        />
      </div>
      <div style={s.orderHint}>{t("skills.orderHint")}</div>

      {ordered.length === 0 ? (
        <EmptyState icon="Sparkles" title={t("skills.emptyTitle")} body={t("skills.emptyBody")} />
      ) : (
        visible.map((link) => {
          const skill = skillsById.get(link.skill_id);
          if (!skill) return null;
          const index = ordered.indexOf(link);
          const globallyOff = !skill.enabled;
          return (
            <div
              key={link.skill_id}
              draggable
              onDragStart={() => (dragIndex.current = index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex.current == null || dragIndex.current === index) return;
                const next = [...ordered];
                const [moved] = next.splice(dragIndex.current, 1);
                next.splice(index, 0, moved!);
                send(toEntries(next));
                dragIndex.current = null;
              }}
              style={s.row(globallyOff)}
            >
              <span aria-hidden style={s.dragHandle}>
                ⠿
              </span>
              <Checkbox checked={link.enabled} onChange={() => toggle(link.skill_id)} />
              <div style={s.name}>
                <span className="mono">{skill.name}</span>
                {globallyOff && <div style={s.mutedHint}>{t("skills.globallyDisabledHint")}</div>}
              </div>
              <Badge color="var(--text-secondary)" mono>
                {skill.type}
              </Badge>
              <div style={s.actions}>
                <IconBtn
                  icon="ArrowUp"
                  label={t("skills.moveUp")}
                  onClick={() => move(index, -1)}
                />
                <IconBtn
                  icon="ArrowDown"
                  label={t("skills.moveDown")}
                  onClick={() => move(index, 1)}
                />
                <IconBtn icon="X" label={t("skills.unlink")} danger onClick={() => unlink(link.skill_id)} />
              </div>
            </div>
          );
        })
      )}

      <div style={s.footer}>
        <Dropdown
          width={220}
          trigger={<span style={{ cursor: "pointer", color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>+ {t("skills.linkSkill")}</span>}
          items={
            unlinked.length === 0
              ? [{ label: t("skills.linkSkillEmpty"), muted: true }]
              : unlinked.map((sk) => ({ label: sk.name, icon: "Sparkles" as const, onClick: () => linkSkill(sk.id) }))
          }
        />
      </div>
    </div>
  );
}

export default SkillsTab;
