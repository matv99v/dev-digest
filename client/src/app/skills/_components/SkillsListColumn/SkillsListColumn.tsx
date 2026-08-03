/* SkillsListColumn — the 280px list rail shared by /skills and /skills/:id:
   search, "Add Skill" (create from scratch / import from file), and the
   SkillCard list. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { useSkills, useCreateSkill, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { ImportSkillDrawer } from "../ImportSkillDrawer";
import { DEFAULT_NEW_SKILL } from "./constants";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListColumn({ selectedId }: { selectedId: string | null }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  const list = filterSkills(skills ?? [], search);

  const createFromScratch = () => {
    create.mutate(DEFAULT_NEW_SKILL, {
      onSuccess: (skill) => router.push(`/skills/${skill.id}?tab=config`),
    });
  };

  return (
    <div style={s.wrap}>
      {importing && <ImportSkillDrawer onClose={() => setImporting(false)} />}
      <div style={s.header}>
        <div style={s.headerRow}>
          <h1 style={s.h1}>{t("page.heading")}</h1>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.createFromScratch"), icon: "Edit", onClick: createFromScratch },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>

      <div style={s.list}>
        {isLoading && (
          <>
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={90} />
          </>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setImporting(true)}
          />
        )}
        {list.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            active={skill.id === selectedId}
            onClick={() => router.push(`/skills/${skill.id}?tab=config`)}
            onToggle={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
          />
        ))}
      </div>
    </div>
  );
}

export default SkillsListColumn;
