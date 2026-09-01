"use client";

import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import type { SkillVersion } from "@devdigest/shared";
import { diffLines } from "../../helpers";
import { s } from "./styles";

/** Line-level diff between two adjacent skill-body versions. `from` is the
    older version, `to` the newer one. */
export function VersionDiffModal({
  from,
  to,
  onClose,
}: {
  from: SkillVersion;
  to: SkillVersion;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const lines = diffLines(from.body, to.body);
  const changed = lines.some((l) => l.type !== "same");

  return (
    <Modal
      width={760}
      title={t("versions.diffTitle", { from: from.version, to: to.version })}
      onClose={onClose}
    >
      <div style={s.body}>
        {!changed ? (
          <div style={s.empty}>{t("versions.diffNoChange")}</div>
        ) : (
          <pre style={s.pre}>
            {lines.map((line, i) => (
              <div key={i} style={s.line(line.type)}>
                <span style={s.gutter(line.type)}>{line.type === "add" ? "+" : line.type === "del" ? "−" : " "}</span>
                <span style={s.text}>{line.text || " "}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </Modal>
  );
}
