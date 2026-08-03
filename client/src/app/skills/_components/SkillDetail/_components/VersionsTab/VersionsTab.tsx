/* VersionsTab — full version history: message + date per version, the
   newest marked Current with no actions, older ones get Diff (against the
   CURRENT persisted body) and Restore. Restore never rewrites history — it
   always appends a brand-new version. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, Modal, Skeleton, ErrorState } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useRestoreSkillVersion } from "@/lib/hooks/skills";
import { lineDiff } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffing, setDiffing] = React.useState<SkillVersion | null>(null);

  if (isLoading) return <Skeleton height={200} />;
  if (isError || !versions) {
    return <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />;
  }

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        <Badge color="var(--text-muted)">{t("versions.count", { count: versions.length })}</Badge>
      </div>
      <div style={s.description}>{t("versions.description")}</div>

      {versions.map((v, i) => {
        const isCurrent = i === 0;
        return (
          <div key={v.version} style={s.row}>
            <Badge color="var(--accent)" mono>
              {t("preview.version", { version: v.version })}
            </Badge>
            <div style={s.rowText}>
              <div style={s.message}>{v.message ?? "—"}</div>
              <div style={s.date}>{new Date(v.created_at).toLocaleString()}</div>
            </div>
            {isCurrent ? (
              <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
                {t("versions.current")}
              </Badge>
            ) : (
              <div style={s.actions}>
                <Button kind="secondary" size="sm" onClick={() => setDiffing(v)}>
                  {t("versions.diff")}
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate({ id: skill.id, version: v.version })}
                >
                  {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {diffing && (
        <Modal
          width={800}
          title={t("versions.diffModalTitle", { version: diffing.version })}
          onClose={() => setDiffing(null)}
        >
          <div style={s.diffBox} className="mono">
            {lineDiff(diffing.body, skill.body).map((line, i) => (
              <div key={i} style={s.diffLine(line.type)}>
                {line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}
                {line.text}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default VersionsTab;
