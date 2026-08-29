/* SeverityCounts — "⊗2 ⚠1 · 💡2" per-severity finding counters, shared by the PR
   list's FINDINGS column and the PR detail timeline's per-run row.

   Read-only by default; passing onSelect turns each non-zero entry into a
   button (dotted underline, like the agent-name button in RunHistory) so a
   click can drive a severity filter without adding a chip row anywhere. */
"use client";

import React from "react";
import type { CSSProperties } from "react";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITY_KEYS, NO_FINDINGS, totalCount, type SeverityCountMap } from "./helpers";

const wrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const entryStyle = (color: string, interactive: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  color,
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  fontWeight: 600,
  cursor: interactive ? "pointer" : "default",
  textDecoration: interactive ? "underline" : "none",
  textDecorationStyle: "dotted",
  textUnderlineOffset: 3,
});

export interface SeverityCountsProps {
  counts: SeverityCountMap | null | undefined;
  /** When given, each non-zero severity becomes a clickable filter toggle. */
  onSelect?: (severity: Severity) => void;
  /** The currently-active filter, for aria-pressed. */
  active?: Severity | null;
  size?: number;
  style?: CSSProperties;
}

export function SeverityCounts({ counts, onSelect, active = null, size = 12.5, style }: SeverityCountsProps) {
  const total = totalCount(counts);
  if (total === 0 || !counts) {
    return (
      <span className="mono" style={{ fontSize: size, color: "var(--text-muted)", ...style }}>
        {NO_FINDINGS}
      </span>
    );
  }

  return (
    <span className="mono tnum" style={{ ...wrapStyle, fontSize: size, ...style }}>
      {SEVERITY_KEYS.filter((key) => counts[key] > 0).map((key) => {
        const meta = SEV[key];
        const I = Icon[meta.icon];
        const count = counts[key];
        const label = `${count} ${meta.label}`;
        const inner = (
          <>
            <I size={size + 1.5} />
            {count}
          </>
        );
        if (!onSelect) {
          return (
            <span key={key} title={label} aria-label={label} style={entryStyle(meta.c, false)}>
              {inner}
            </span>
          );
        }
        return (
          <button
            key={key}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active === key}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(key);
            }}
            style={entryStyle(meta.c, true)}
          >
            {inner}
          </button>
        );
      })}
    </span>
  );
}

export default SeverityCounts;
