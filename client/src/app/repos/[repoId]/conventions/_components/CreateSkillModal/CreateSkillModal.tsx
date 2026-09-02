/* CreateSkillModal — turn accepted conventions into one or more Skills.
   Structural template: app/skills/_components/CreateSkillModal. Richer here:
   a merged-vs-per-category mode switch drives which draft(s) the server
   suggests (GET .../skill-draft?mode=...), and every draft stays editable
   before POST .../conventions/skills persists it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, ErrorState, FormField, Modal, Skeleton, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionSkillDraft, ConventionSkillDraftMode } from "@devdigest/shared";
import { useConventionSkillDraft, useCreateConventionSkills } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { SkillBodyEditor } from "@/components/skill-body-editor";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function CreateSkillModal({
  repoId,
  repoName,
  onClose,
}: {
  repoId: string;
  repoName: string;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const toast = useToast();
  const [mode, setMode] = React.useState<ConventionSkillDraftMode>("merged");
  const { data, isLoading, isError, refetch } = useConventionSkillDraft(repoId, mode);
  const create = useCreateConventionSkills();
  const [drafts, setDrafts] = React.useState<ConventionSkillDraft[]>([]);

  // Seed local edit state once per mode (not on every background refetch of
  // the same mode) so switching back to a mode already visited keeps the
  // user's edits, matching the `seeded` ref pattern used in SkillsTab.
  const seededMode = React.useRef<ConventionSkillDraftMode | null>(null);
  React.useEffect(() => {
    if (data && seededMode.current !== mode) {
      setDrafts(data);
      seededMode.current = mode;
    }
  }, [data, mode]);

  const updateDraft = (index: number, patch: Partial<ConventionSkillDraft>) =>
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  const submit = () => {
    create.mutate(
      { repoId, drafts },
      {
        onSuccess: () => {
          toast.success(t("modal.successToast"));
          onClose();
        },
      },
    );
  };

  const totalConventions = drafts.reduce((n, d) => n + d.convention_ids.length, 0);

  const renderFields = (draft: ConventionSkillDraft, index: number) => (
    <>
      <FormField label={t("modal.name")} required>
        <TextInput value={draft.name} onChange={(v) => updateDraft(index, { name: v })} />
      </FormField>
      <FormField label={t("modal.description")}>
        <TextInput value={draft.description} onChange={(v) => updateDraft(index, { description: v })} />
      </FormField>
      <FormField label={t("modal.type")}>
        <span style={s.typeRow}>{tSkills("config.typeOptions.convention")}</span>
      </FormField>
      <FormField label={t("modal.enabled")}>
        <Toggle on={draft.enabled} onChange={(v) => updateDraft(index, { enabled: v })} size={16} />
      </FormField>
      <FormField label={t("modal.body")}>
        <SkillBodyEditor
          name={draft.name}
          value={draft.body}
          initialValue={data?.[index]?.body ?? draft.body}
          onChange={(v) => updateDraft(index, { body: v })}
        />
      </FormField>
    </>
  );

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={submit}
            disabled={create.isPending || isLoading || drafts.length === 0}
          >
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.modeRow}>
          <Chip active={mode === "merged"} onClick={() => setMode("merged")}>
            {t("modal.modeMerged")}
          </Chip>
          <Chip active={mode === "per_category"} onClick={() => setMode("per_category")}>
            {t("modal.modePerCategory")}
          </Chip>
        </div>

        {isLoading ? (
          <Skeleton height={120} />
        ) : isError ? (
          <ErrorState title={t("page.loadError")} onRetry={() => refetch()} />
        ) : mode === "merged" ? (
          <>
            <div style={s.banner}>
              {t("modal.mergedFromBanner", { count: totalConventions, repo: repoName })}
            </div>
            {drafts[0] && renderFields(drafts[0], 0)}
          </>
        ) : (
          drafts.map((draft, i) => (
            <details key={i} open style={s.draftCard}>
              <summary style={s.draftHeader}>
                <span style={s.draftCategory}>{draft.name}</span>
              </summary>
              {renderFields(draft, i)}
            </details>
          ))
        )}
      </div>
    </Modal>
  );
}
