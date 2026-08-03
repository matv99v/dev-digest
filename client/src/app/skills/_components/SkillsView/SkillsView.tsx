/* SkillsView — the two-column shell shared by /skills and /skills/:id
   (mirrors the agent editor's list + detail layout, but here BOTH routes
   need it, so it's shared instead of split between two page components). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { SkillsListColumn } from "../SkillsListColumn";
import { SkillDetail } from "../SkillDetail";
import { s } from "./styles";

export function SkillsView({ id }: { id?: string }) {
  const t = useTranslations("skills");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }];

  return (
    <AppShell crumb={crumb}>
      <div style={s.shell}>
        <SkillsListColumn selectedId={id ?? null} />
        {id ? (
          <SkillDetail id={id} />
        ) : (
          <div style={s.placeholder}>
            <EmptyState
              icon="Sparkles"
              title={t("page.selectPrompt.title")}
              body={t("page.selectPrompt.body")}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default SkillsView;
