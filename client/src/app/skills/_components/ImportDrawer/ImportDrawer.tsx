/* ImportDrawer — "Add a skill" flow: pick a .md/.zip file, preview what would
   be created (server-parsed, nothing persisted), then confirm. The imported
   skill always lands source="imported_url", enabled=false — untrusted until
   vetted, per the L02 trust story. "From URL" and "Community" render their
   copy but are inert (out of scope for this lesson). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, Button, FormField, TextInput, Tabs } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SkillBodyEditor } from "@/app/skills/_components/SkillBodyEditor";
import { DRAWER_WIDTH, IMPORT_TABS, type ImportTab } from "./constants";
import { fileToBase64 } from "./helpers";
import { s } from "./styles";

export function ImportDrawer({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (skillId: string) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const [tab, setTab] = React.useState<ImportTab>("file");
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const importPreview = useImportSkillPreview();
  const create = useCreateSkill();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content_base64 = await fileToBase64(file);
      const result = await importPreview.mutateAsync({ filename: file.name, content_base64 });
      setPreview(result);
      setName(result.name);
      setBody(result.body);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirm = async () => {
    if (!preview) return;
    const skill = await create.mutateAsync({
      name: name.trim() || preview.name,
      description: preview.description,
      type: preview.type,
      source: "imported_url",
      body,
      enabled: false,
    });
    toast.success(t("file.success", { name: skill.name }));
    onImported(skill.id);
  };

  return (
    <Drawer width={DRAWER_WIDTH} title={t("drawer.title")} subtitle={t("drawer.subtitle")} onClose={onClose}>
      <Tabs
        tabs={IMPORT_TABS.map((tb) => ({ key: tb, label: t(`drawer.tabs.${tb}`) }))}
        value={tab}
        onChange={(k) => setTab(k as ImportTab)}
        pad="0"
      />
      <div style={s.body}>
        {tab === "file" && !preview && (
          <div style={s.dropzone}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.zip"
              onChange={onFileChange}
              disabled={importPreview.isPending}
            />
            <span style={s.dropHint}>
              {importPreview.isPending ? t("file.importing") : t("file.bodyHint")}
            </span>
          </div>
        )}

        {tab === "file" && preview && (
          <>
            <FormField label={t("file.nameLabel")} hint={t("file.nameHint")}>
              <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} />
            </FormField>
            <FormField label={t("preview.bodyLabel")} hint={t("file.bodyHint")}>
              <SkillBodyEditor name={name} value={body} initialValue={preview.body} onChange={setBody} />
            </FormField>
            {preview.ignored_files.length > 0 && (
              <div style={s.ignored}>
                <div style={s.ignoredTitle}>Not processed, never read as instructions:</div>
                <ul style={s.ignoredList}>
                  {preview.ignored_files.map((f) => (
                    <li key={f} className="mono">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <Button kind="ghost" onClick={() => setPreview(null)}>
                {t("detail.back")}
              </Button>
              <Button kind="primary" icon="Plus" onClick={confirm} disabled={create.isPending}>
                {create.isPending ? t("file.importing") : t("file.import")}
              </Button>
            </div>
          </>
        )}

        {tab === "url" && (
          <>
            <FormField label={t("url.label")} hint={t("url.hint")}>
              <TextInput value="" placeholder={t("url.placeholder")} disabled />
            </FormField>
            <div style={s.inertNote}>{t("url.hint")}</div>
          </>
        )}

        {tab === "community" && (
          <>
            <FormField label={t("community.searchPlaceholder")}>
              <TextInput value="" placeholder={t("community.searchPlaceholder")} disabled />
            </FormField>
            <div style={s.inertNote}>{t("community.searchPlaceholder")}</div>
          </>
        )}
      </div>
    </Drawer>
  );
}
