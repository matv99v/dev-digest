/* SkillDetail — header (icon/name/type/version) + Tabs + tab body. Owns the
   ONE unsaved draft (name/description/type/body) shared between ConfigTab
   (writes it) and PreviewTab (reads it when dirty), so Preview always shows
   what the user is actually about to save, not the last-persisted body. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Badge, Tabs, ErrorState, Skeleton } from "@devdigest/ui";
import { useSkill } from "../../../../lib/hooks/skills";
import { typeStyle } from "../SkillCard";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS, VALID_TABS, type SkillDraft } from "./constants";
import { s } from "./styles";

export function SkillDetail({ id }: { id: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: skill, isLoading, isError, refetch } = useSkill(id);

  const tabParam = searchParams.get("tab") ?? "";
  const tab = VALID_TABS.includes(tabParam) ? tabParam : "config";
  const setTab = (k: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", k);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const [draft, setDraft] = React.useState<SkillDraft | null>(null);

  // Re-sync the draft whenever a fresh persisted version lands (first load,
  // switching skills, or a successful save/restore bumping `version`) — never
  // while the user is still mid-edit against the SAME version.
  React.useEffect(() => {
    if (skill) {
      setDraft({
        name: skill.name,
        description: skill.description,
        type: skill.type,
        body: skill.body,
      });
    }
  }, [skill?.id, skill?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isError) {
    return (
      <div style={s.pane}>
        <ErrorState title={t("detail.notFound.title")} body={t("detail.loadError")} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !skill || !draft) {
    return (
      <div style={s.pane}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  }

  const dirty =
    draft.name !== skill.name ||
    draft.description !== skill.description ||
    draft.type !== skill.type ||
    draft.body !== skill.body;

  const previewSkill = dirty ? { ...skill, ...draft } : skill;
  const { color, icon } = typeStyle(skill.type);
  const TypeIcon = Icon[icon];

  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <TypeIcon size={18} style={{ color }} />
        <h1 className="mono" style={s.h1}>
          {skill.name}
        </h1>
        <Badge color={color} mono>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <Badge color="var(--text-muted)" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={setTab} pad="0 28px" />
      </div>
      <div style={s.body}>
        {tab === "config" && (
          <ConfigTab skill={skill} draft={draft} onDraftChange={setDraft} dirty={dirty} />
        )}
        {tab === "preview" && <PreviewTab skill={previewSkill} dirty={dirty} />}
        {tab === "stats" && <StatsTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}

export default SkillDetail;
