/* ConfigTab — name/description/type + the markdown body editor, bound to the
   draft SkillDetail lifted (so PreviewTab sees the same unsaved buffer). A
   body change prompts for an optional commit-style message before saving. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Toggle, Button, Modal, Textarea } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { MarkdownEditor } from "@/components/markdown-editor";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import type { SkillDraft } from "../../constants";
import { SKILL_TYPE_VALUES } from "./constants";
import { s } from "./styles";

export function ConfigTab({
  skill,
  draft,
  onDraftChange,
  dirty,
}: {
  skill: Skill;
  draft: SkillDraft;
  onDraftChange: (draft: SkillDraft) => void;
  dirty: boolean;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [commitOpen, setCommitOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    setEnabled(skill.enabled);
  }, [skill.id, skill.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const bodyChanged = draft.body !== skill.body;

  const doSave = (msg?: string) => {
    update.mutate(
      {
        id: skill.id,
        patch: {
          name: draft.name,
          description: draft.description,
          type: draft.type,
          body: draft.body,
          enabled,
          ...(msg ? { message: msg } : {}),
        },
      },
      { onSuccess: (data) => toast.success(t("editor.saved", { version: data.version })) },
    );
    setCommitOpen(false);
    setMessage("");
  };

  const save = () => {
    if (bodyChanged) {
      setCommitOpen(true);
      return;
    }
    doSave();
  };

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.h2}>{t("editor.title")}</h2>
        <label style={s.enabledLabel}>
          {t("editor.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      <FormField label={t("editor.name")} required>
        <TextInput value={draft.name} onChange={(v) => onDraftChange({ ...draft, name: v })} />
      </FormField>

      <FormField label={t("editor.description")} hint={t("editor.descriptionHint")}>
        <TextInput
          value={draft.description}
          onChange={(v) => onDraftChange({ ...draft, description: v })}
        />
      </FormField>

      <FormField label={t("editor.type")}>
        <SelectInput
          value={draft.type}
          onChange={(v) => onDraftChange({ ...draft, type: v as SkillType })}
          options={typeOptions}
        />
      </FormField>

      <div style={s.editorField}>
        <MarkdownEditor
          value={draft.body}
          onChange={(v) => onDraftChange({ ...draft, body: v })}
          filename={`${draft.name || skill.name}.md`}
          dirty={dirty}
        />
      </div>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? t("editor.saving") : t("editor.save")}
        </Button>
        {update.isSuccess && !dirty && (
          <span style={s.savedNote}>{t("editor.saved", { version: update.data?.version })}</span>
        )}
      </div>

      {commitOpen && (
        <Modal
          title={t("editor.commitMessage.title")}
          onClose={() => setCommitOpen(false)}
          footer={
            <>
              <Button kind="secondary" onClick={() => setCommitOpen(false)}>
                {t("editor.commitMessage.cancel")}
              </Button>
              <Button kind="primary" onClick={() => doSave(message || undefined)}>
                {t("editor.commitMessage.save")}
              </Button>
            </>
          }
        >
          <FormField label={t("editor.commitMessage.label")} hint={t("editor.commitMessage.hint")}>
            <Textarea
              value={message}
              onChange={setMessage}
              rows={3}
              placeholder={t("editor.commitMessage.placeholder")}
            />
          </FormField>
        </Modal>
      )}
    </div>
  );
}

export default ConfigTab;
