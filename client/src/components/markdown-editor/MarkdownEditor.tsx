/* MarkdownEditor — a small home-grown gutter editor for markdown skill
   bodies (line numbers, filename chip, unsaved badge, live token counter).
   NOT a syntax-highlighting editor — no new dependency (no CodeMirror etc).
   Cross-feature: used by the skill Config tab, and later likely the agent
   system-prompt editor, which is why it lives at this top level next to
   siblings like components/run-cost-badge. */
"use client";

import React, { useRef } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { useCountTokens } from "../../lib/hooks/skills";
import { useDebouncedValue, heuristicTokens } from "./helpers";
import {
  containerStyle,
  headerStyle,
  filenameChipStyle,
  spacerStyle,
  tokenCountStyle,
  bodyStyle,
  gutterStyle,
  textareaStyle,
} from "./styles";

export function MarkdownEditor({
  value,
  onChange,
  filename,
  dirty = false,
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Chip text, e.g. "pr-quality-rubric.md". */
  filename: string;
  /** Shows an "unsaved" badge in the header when true. */
  dirty?: boolean;
  readOnly?: boolean;
}) {
  const t = useTranslations("skills");
  const gutterRef = useRef<HTMLDivElement>(null);

  const debounced = useDebouncedValue(value, 400);
  const tokenQuery = useCountTokens(debounced);

  // While the debounced value hasn't caught up to the live value yet, or the
  // query hasn't resolved, fall back to the heuristic so the count never
  // blanks or flickers to empty.
  const tokens =
    debounced === value && tokenQuery.data != null
      ? tokenQuery.data.tokens
      : heuristicTokens(value);

  const lineCount = value.split("\n").length;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span className="mono" style={filenameChipStyle}>
          {filename}
        </span>
        {dirty && <Badge>{t("body.unsaved")}</Badge>}
        <span style={spacerStyle} />
        <span style={tokenCountStyle}>{t("body.tokens", { count: tokens })}</span>
      </div>
      <div style={bodyStyle}>
        <div ref={gutterRef} style={gutterStyle}>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          className="mono"
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutterRef.current) {
              gutterRef.current.scrollTop = e.currentTarget.scrollTop;
            }
          }}
          style={textareaStyle}
        />
      </div>
    </div>
  );
}

export default MarkdownEditor;
