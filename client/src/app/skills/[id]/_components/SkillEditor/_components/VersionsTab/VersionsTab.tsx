"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { VersionDiffModal } from "./_components/VersionDiffModal";
import { s } from "./styles";

/** Versions tab — every save that changed the body snapshots a new version;
    each is restorable, and adjacent versions can be diffed (no diff library
    in this repo — a small line-level LCS diff lives in `./helpers`). */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffPair, setDiffPair] = React.useState<{ from: SkillVersion; to: SkillVersion } | null>(null);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        {versions && <Badge color="var(--text-muted)">{t("versions.count", { count: versions.length })}</Badge>}
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>
      {isLoading && <Skeleton height={60} />}
      {(versions ?? []).map((v, i) => {
        const isCurrent = v.version === skill.version;
        // `versions` is newest-first, so the next entry is the version just
        // before this one — the pair a "Diff" click compares.
        const prev = versions?.[i + 1];
        return (
          <Card key={v.version} style={s.row}>
            <span className="mono" style={s.versionLabel}>
              v{v.version}
            </span>
            <div style={s.rowBody}>
              {v.message && <div style={s.message}>{v.message}</div>}
              <div style={s.date}>{new Date(v.created_at).toLocaleString()}</div>
            </div>
            <div style={s.actions}>
              {prev && (
                <Button kind="ghost" size="sm" icon="Eye" onClick={() => setDiffPair({ from: prev, to: v })}>
                  {t("versions.diff")}
                </Button>
              )}
              {isCurrent ? (
                <Badge dot color="var(--ok)" bg="var(--ok-bg)">
                  {t("versions.current")}
                </Badge>
              ) : (
                <Button
                  kind="secondary"
                  size="sm"
                  icon="History"
                  disabled={restore.isPending}
                  onClick={() =>
                    restore.mutate(
                      { id: skill.id, version: v.version },
                      { onSuccess: (data) => toast.success(t("versions.restored", { version: data.version })) },
                    )
                  }
                >
                  {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                </Button>
              )}
            </div>
          </Card>
        );
      })}
      {diffPair && (
        <VersionDiffModal from={diffPair.from} to={diffPair.to} onClose={() => setDiffPair(null)} />
      )}
    </div>
  );
}
