/* AgentEditor — agent config editor (model + system prompt) + Skills tab
   (L02) + Stats tab. Later lessons add CI. Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { SkillsTab } from "./_components/SkillsTab";
import { StatsTab } from "./_components/StatsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function AgentEditor({ agent, tab, onTab }: { agent: Agent; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "skills" && <SkillsTab key={agent.id} agent={agent} />}
        {tab === "stats" && <StatsTab key={agent.id} agent={agent} />}
        {tab !== "skills" && tab !== "stats" && <ConfigTab key={agent.id} agent={agent} />}
      </div>
    </div>
  );
}
