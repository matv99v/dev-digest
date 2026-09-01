/* SkillBodyEditor — hand-rolled markdown body editor: filename chip + unsaved
   badge + token count, and a line-numbered gutter scroll-synced to a plain
   mono <textarea>. No syntax highlighting (approved design decision) and no
   editor dependency — this is app-level, not a @devdigest/ui primitive. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { LINE_HEIGHT, s } from "./styles";

export function SkillBodyEditor({
  name,
  value,
  initialValue,
  onChange,
  rows = 16,
}: {
  name: string;
  value: string;
  initialValue: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const t = useTranslations("skills");
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const dirty = value !== initialValue;
  const tokenCount = Math.ceil(value.length / 4);
  const lineCount = value.length === 0 ? 1 : value.split("\n").length;
  const boxHeight = rows * LINE_HEIGHT + 20;

  const syncGutterScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.chipRow}>
        <span className="mono" style={s.filename}>
          <Icon.FileText size={12} />
          {(name || "skill").trim() || "skill"}.md
        </span>
        {dirty && (
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("editor.unsaved")}
          </Badge>
        )}
        <span className="tnum" style={s.tokens}>
          {t("editor.tokens", { count: tokenCount })}
        </span>
      </div>
      <div style={{ ...s.editorBox, height: boxHeight }}>
        <div ref={gutterRef} style={{ ...s.gutter, height: boxHeight }}>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={s.lineNo}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncGutterScroll}
          style={{ ...s.textarea, height: boxHeight }}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
