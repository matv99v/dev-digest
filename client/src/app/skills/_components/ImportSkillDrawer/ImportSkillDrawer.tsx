/* ImportSkillDrawer — markdown-only skill import. Two steps: (1) provide
   markdown, either a dropped/picked .md file or a pasted body, both funneled
   through the SAME server-side preview parse; (2) review the parsed
   name/description/body — nothing persists until the user explicitly
   confirms, and confirming always saves the skill disabled ("needs
   vetting") since its body becomes literal instructions in any agent it's
   linked to. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, FormField, TextInput, Textarea, Markdown, Badge, Icon } from "@devdigest/ui";
import { useImportPreview, useCreateSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { filenameFromName, readFileAsText } from "./helpers";
import { s } from "./styles";

export function ImportSkillDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const preview = useImportPreview();
  const create = useCreateSkill();

  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const runPreview = (filename: string, content: string) => {
    preview.mutate(
      { filename, content },
      { onError: () => toast.error(t("drawer.importFailed")) },
    );
  };

  const onFilePicked = async (file: File) => {
    const content = await readFileAsText(file);
    runPreview(file.name, content);
  };

  const onPasteSubmit = () => {
    if (!body.trim()) return;
    runPreview(filenameFromName(name), body);
  };

  const back = () => preview.reset();

  const confirm = () => {
    if (!preview.data) return;
    create.mutate(
      {
        name: preview.data.name,
        description: preview.data.description,
        type: preview.data.type,
        body: preview.data.body,
        source: "imported_file",
        enabled: false,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("file.success", { name: skill.name }));
          onClose();
        },
      },
    );
  };

  return (
    <Drawer title={t("drawer.title")} subtitle={t("drawer.subtitle")} onClose={onClose} width={560}>
      {!preview.data ? (
        <>
          <div
            style={s.dropzone}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) void onFilePicked(file);
            }}
          >
            <Icon.Upload size={18} style={{ marginBottom: 6 }} />
            <div>{t("page.menu.fromFile")}</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFilePicked(file);
                e.target.value = "";
              }}
            />
          </div>

          <div style={s.divider}>
            <span style={s.dividerLine} />
            <span>or</span>
            <span style={s.dividerLine} />
          </div>

          <div style={s.section}>
            <FormField label={t("file.nameLabel")} hint={t("file.nameHint")}>
              <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} />
            </FormField>
            <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")}>
              <Textarea
                value={body}
                onChange={setBody}
                placeholder={t("file.bodyPlaceholder")}
                rows={10}
                mono
              />
            </FormField>
            <Button
              kind="primary"
              onClick={onPasteSubmit}
              disabled={!body.trim() || preview.isPending}
            >
              {preview.isPending ? t("file.importing") : t("file.import")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div style={s.previewHeading}>{t("file.previewTitle")}</div>
          <div style={s.previewMeta}>
            <span className="mono" style={{ fontWeight: 600 }}>
              {preview.data.name}
            </span>
            <Badge color="var(--accent)" mono>
              {t(`listItem.type.${preview.data.type}`)}
            </Badge>
          </div>
          {preview.data.description && (
            <div style={s.previewDescription}>{preview.data.description}</div>
          )}

          {preview.data.warnings.length > 0 && (
            <div style={s.warningsBox}>
              <div style={s.warningsTitle}>{t("file.warningsTitle")}</div>
              {preview.data.warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}

          <div style={s.bodyCard}>
            <Markdown>{preview.data.body}</Markdown>
          </div>

          <div style={s.notice}>
            <Icon.AlertTriangle size={16} />
            <span>{t("preview.untrustedNotice")}</span>
          </div>

          <div style={s.footer}>
            <Button kind="secondary" onClick={back} disabled={create.isPending}>
              {t("file.back")}
            </Button>
            <Button kind="primary" onClick={confirm} disabled={create.isPending}>
              {create.isPending ? t("file.confirming") : t("file.confirm")}
            </Button>
            <span style={s.confirmHint}>{t("file.confirmHint")}</span>
          </div>
        </>
      )}
    </Drawer>
  );
}

export default ImportSkillDrawer;
