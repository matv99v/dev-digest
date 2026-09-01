"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { MODAL_WIDTH, TYPE_VALUES } from "./constants";
import { s } from "./styles";

/** Create-skill modal — name/description/type/body. */
export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<Skill["type"]>("custom");
  const [body, setBody] = React.useState("");

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`config.typeOptions.${v}`) }));

  const submit = async () => {
    const skill = await create.mutateAsync({
      name: name.trim() || t("file.namePlaceholder"),
      description,
      type,
      source: "manual",
      body: body.trim() || `# ${name.trim() || t("file.namePlaceholder")}\n`,
    });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("page.menu.create")}
      subtitle={t("config.descriptionHint")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("config.saving") : t("page.menu.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("config.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} />
        </FormField>
        <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <FormField label={t("config.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as Skill["type"])} options={typeOptions} />
        </FormField>
        <FormField label={t("preview.bodyLabel")} hint={t("file.bodyPlaceholder")}>
          <Textarea value={body} onChange={setBody} rows={8} mono placeholder={t("file.bodyPlaceholder")} />
        </FormField>
      </div>
    </Modal>
  );
}
