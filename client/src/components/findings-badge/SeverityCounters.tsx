/* SeverityCounters — a PR's (or one run's) live findings as "⛔ 2  ⚠ 1  💡 4".
   Presentational only: hover previewing and navigation live in FindingsCell. */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import type { PrFindingCounts } from "@devdigest/shared";
import { NO_DATA, countersOf } from "./helpers";

const wrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  whiteSpace: "nowrap",
};

export function SeverityCounters({
  counts,
  /** Dotted underline + pointer, signalling the counters are a click target. */
  interactive = false,
  hovered = false,
  size = 13,
}: {
  counts: PrFindingCounts | null | undefined;
  interactive?: boolean;
  hovered?: boolean;
  size?: number;
}) {
  const counters = countersOf(counts);

  // No findings reads "—", never "0" — the same call formatCost makes for money:
  // a bare zero claims the PR was reviewed and came back clean, which is a
  // stronger statement than "there is nothing to show here".
  if (counters.length === 0) {
    return <span style={{ color: "var(--text-muted)" }}>{NO_DATA}</span>;
  }

  return (
    <span style={wrapStyle}>
      {counters.map(({ severity, count }) => {
        const sev = SEV[severity];
        const I = Icon[sev.icon];
        return (
          <span
            key={severity}
            title={`${count} ${sev.label.toLowerCase()}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: sev.c,
              fontSize: size,
              fontWeight: 600,
              cursor: interactive ? "pointer" : undefined,
              borderBottom: interactive
                ? `1px dotted ${hovered ? sev.c : "transparent"}`
                : undefined,
            }}
          >
            <I size={size} />
            <span className="tnum">{count}</span>
          </span>
        );
      })}
    </span>
  );
}

export default SeverityCounters;
