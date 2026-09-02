/* ConventionCard — one extracted candidate: rule text (inline-editable),
   category tag, evidence (github link + code snippet), confidence, and
   accept/reject actions. Structurally mirrors FindingCard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ConfidenceNum, IconBtn, MonoLink, TextInput } from "@devdigest/ui";
import type { Convention } from "@devdigest/shared";
import { useUpdateConvention } from "@/lib/hooks";
import { evidenceLineLabel, conventionEvidenceHref } from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  convention,
  repoFullName,
  defaultBranch,
}: {
  convention: Convention;
  repoFullName: string;
  defaultBranch: string;
}) {
  const t = useTranslations("conventions");
  const update = useUpdateConvention();
  const [editing, setEditing] = React.useState(false);
  const [ruleDraft, setRuleDraft] = React.useState(convention.rule);

  const { status, evidence } = convention;
  const href = conventionEvidenceHref(repoFullName, convention.scanned_sha, defaultBranch, evidence);

  const startEdit = () => {
    setRuleDraft(convention.rule);
    setEditing(true);
  };
  const cancelEdit = () => {
    setRuleDraft(convention.rule);
    setEditing(false);
  };
  const saveEdit = () => {
    const rule = ruleDraft.trim();
    if (!rule || rule === convention.rule) {
      setEditing(false);
      return;
    }
    update.mutate({ id: convention.id, patch: { rule } }, { onSuccess: () => setEditing(false) });
  };

  return (
    <div style={s.card(status)}>
      <div style={s.body}>
        <div style={s.headerRow}>
          <div style={s.ruleCol}>
            {editing ? (
              <div style={s.editRow}>
                <TextInput value={ruleDraft} onChange={setRuleDraft} />
                <Button kind="secondary" size="sm" onClick={saveEdit} disabled={update.isPending}>
                  {t("card.save")}
                </Button>
                <Button kind="ghost" size="sm" onClick={cancelEdit}>
                  {t("card.cancel")}
                </Button>
              </div>
            ) : (
              <div style={s.ruleRow}>
                <span style={s.rule}>{convention.rule}</span>
                <IconBtn icon="Edit" label={t("card.edit")} size={22} onClick={startEdit} />
                {convention.category && (
                  <Badge mono={false}>{convention.category}</Badge>
                )}
                {status === "accepted" && (
                  <span style={s.statusTag("var(--ok)")}>{t("card.accepted")}</span>
                )}
                {status === "rejected" && (
                  <span style={s.statusTag("var(--text-muted)")}>{t("card.rejected")}</span>
                )}
              </div>
            )}
            <div style={s.metaRow}>
              <MonoLink href={href}>
                {evidence.path}:{evidenceLineLabel(evidence)}
              </MonoLink>
              <ConfidenceNum value={convention.confidence} />
            </div>
          </div>
        </div>

        <pre className="mono" style={s.snippet}>
          {evidence.snippet}
        </pre>

        <div style={s.actions}>
          <Button
            kind="secondary"
            size="sm"
            icon="Check"
            active={status === "accepted"}
            disabled={update.isPending}
            onClick={() => update.mutate({ id: convention.id, patch: { status: "accepted" } })}
          >
            {update.isPending && update.variables?.patch.status === "accepted"
              ? t("card.accepting")
              : t("card.acceptAsSkill")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon="X"
            active={status === "rejected"}
            disabled={update.isPending}
            onClick={() => update.mutate({ id: convention.id, patch: { status: "rejected" } })}
          >
            {update.isPending && update.variables?.patch.status === "rejected"
              ? t("card.rejecting")
              : t("card.reject")}
          </Button>
        </div>
      </div>
    </div>
  );
}
