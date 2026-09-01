/* SkillsTab — attach/detach/reorder skills for one agent. Every change (a
   checkbox toggle or a drag-reorder) immediately persists the whole ordered
   set via POST /agents/:id/skills — there is no separate save button. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Badge, Checkbox, EmptyState, Icon, Skeleton, SKILL_TYPE } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkillLinks, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { initialOrder } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: allSkills } = useSkills();
  const { data: links } = useAgentSkillLinks(agent.id);
  const setSkills = useSetAgentSkills();

  // `order` holds EVERY skill id, checked or not — one flat, always-draggable
  // list. Checking a box only flips membership in `linkedIds`; it never moves
  // the row. Dragging moves a row regardless of its checked state. Only the
  // relative order of the CHECKED ids is ever sent to the server — there is
  // nothing to persist for an unchecked row's position.
  const [order, setOrder] = React.useState<string[]>([]);
  const [linkedIds, setLinkedIds] = React.useState<Set<string>>(new Set());
  const seeded = React.useRef(false);
  const [filter, setFilter] = React.useState("");
  const dragId = React.useRef<string | null>(null);

  // Seed once, when both the catalog and this agent's current links have
  // loaded — never again, so an in-flight reorder/toggle isn't clobbered by a
  // refetch.
  React.useEffect(() => {
    if (seeded.current || !allSkills || links === undefined) return;
    setOrder(initialOrder(allSkills.map((sk) => sk.id), links));
    setLinkedIds(new Set(links.map((l) => l.skill_id)));
    seeded.current = true;
  }, [allSkills, links]);

  const persist = (nextOrder: string[], nextLinked: Set<string>) => {
    setOrder(nextOrder);
    setLinkedIds(nextLinked);
    setSkills.mutate({
      agentId: agent.id,
      skillIds: nextOrder.filter((id) => nextLinked.has(id)),
    });
  };

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(linkedIds);
    if (checked) next.add(id);
    else next.delete(id);
    persist(order, next);
  };

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const from = order.indexOf(fromId);
    const to = order.indexOf(toId);
    if (from === -1 || to === -1) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    persist(next, linkedIds);
  };

  if (!allSkills || links === undefined) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={160} />
        <div style={{ marginTop: 16 }}>
          <Skeleton height={140} />
        </div>
      </div>
    );
  }

  if (allSkills.length === 0) {
    return (
      <div style={s.wrap}>
        <EmptyState
          icon="Sparkles"
          title={t("skills.emptyTitle")}
          body={t("skills.emptyBody")}
          cta={t("skills.emptyCta")}
          onCta={() => router.push("/skills")}
        />
      </div>
    );
  }

  const byId = new Map(allSkills.map((sk) => [sk.id, sk]));
  const q = filter.trim().toLowerCase();
  const rows = order
    .map((id) => byId.get(id))
    .filter((sk): sk is NonNullable<typeof sk> => !!sk)
    .filter((sk) => !q || sk.name.toLowerCase().includes(q));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: linkedIds.size, total: allSkills.length })}
        </Badge>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("skills.filterPlaceholder")}
        style={s.filterInput}
      />

      <div style={s.list}>
        {rows.map((sk) => {
          const linked = linkedIds.has(sk.id);
          return (
            <div
              key={sk.id}
              draggable
              onDragStart={() => (dragId.current = sk.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId.current) reorder(dragId.current, sk.id);
                dragId.current = null;
              }}
              style={s.row(!linked)}
            >
              <span style={s.dragHandle} title="Drag to reorder">
                <Icon.Menu size={14} />
              </span>
              <Checkbox checked={linked} onChange={(v) => toggle(sk.id, v)} />
              <span className="mono" style={s.name}>
                {sk.name}
              </span>
              <Badge mono color={SKILL_TYPE[sk.type].c} bg={SKILL_TYPE[sk.type].bg}>
                {sk.type}
              </Badge>
            </div>
          );
        })}
        {q && rows.length === 0 && <div style={s.emptyFilter}>{t("skills.noMatches")}</div>}
      </div>
    </div>
  );
}
