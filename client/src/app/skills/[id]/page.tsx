/* /skills/:id — Skill Editor. Left skill list + tabbed editor (Config /
   Preview / Evals / Stats / Versions). Tab state lives in ?tab=. Mirrors
   agents/[id]/page.tsx's split-pane shape. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { SkillCard } from "@/app/skills/_components/SkillCard";
import { CreateSkillModal } from "@/app/skills/_components/CreateSkillModal";
import { ImportDrawer } from "@/app/skills/_components/ImportDrawer";
import { SkillEditor } from "./_components/SkillEditor";
import { useSkills, useSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";

const VALID_TABS = ["config", "preview", "evals", "stats", "versions"];

export default function SkillEditorPage() {
  const t = useTranslations("skills");
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;

  const { data: skills } = useSkills();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (tb: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", tb);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.notFound.title")}
          body={error instanceof ApiError ? error.message : t("detail.notFound.body")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      {importing && (
        <ImportDrawer
          onClose={() => setImporting(false)}
          onImported={(newId) => {
            setImporting(false);
            router.push(`/skills/${newId}?tab=config`);
          }}
        />
      )}
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        {/* left: skill list */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-surface)",
          }}
        >
          <div style={{ padding: "16px 16px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>{t("page.heading")}</h1>
              <Dropdown
                width={210}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("page.menu.create"), icon: "Edit", onClick: () => setCreating(true) },
                  { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
                ]}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 12px 12px" }}>
            {(skills ?? []).map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === id}
                onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
              />
            ))}
          </div>
        </div>

        {/* editor */}
        {isLoading || !skill ? (
          <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 }}>
              <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
              <h1 className="mono" style={{ fontSize: 18, fontWeight: 700 }}>
                {skill.name}
              </h1>
              <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                {t(`listItem.type.${skill.type}`)}
              </Badge>
              <Badge color="var(--text-muted)" mono>
                {t("preview.version", { version: skill.version })}
              </Badge>
              <div style={{ marginLeft: "auto" }}>
                <Button kind="secondary" size="sm" icon="FlaskConical" disabled title={t("evals.mountBody")}>
                  {t("detail.runOnEvals")}
                </Button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <SkillEditor skill={skill} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
