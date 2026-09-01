"use client";

import { SEV } from "@devdigest/ui";
import type { AgentStatsDetail } from "@devdigest/shared";
import { s } from "./styles";

type WeekBucket = AgentStatsDetail["findings_by_severity_weekly"][number];

/** Findings-by-severity, one stacked column per rolling week — a lightweight
    inline-SVG/div chart (no charting library pulled in for three colors and
    a handful of bars). */
export function SeverityBars({ weeks, height = 110 }: { weeks: WeekBucket[]; height?: number }) {
  const max = Math.max(1, ...weeks.map((w) => w.critical + w.warning + w.suggestion));

  return (
    <div>
      <div style={s.chart(height)}>
        {weeks.map((w) => {
          const total = w.critical + w.warning + w.suggestion;
          const barHeight = (total / max) * height;
          return (
            <div key={w.week} style={s.col}>
              <div style={s.stack(barHeight)}>
                {w.suggestion > 0 && (
                  <div style={s.segment((w.suggestion / total) * barHeight, SEV.SUGGESTION.c)} />
                )}
                {w.warning > 0 && <div style={s.segment((w.warning / total) * barHeight, SEV.WARNING.c)} />}
                {w.critical > 0 && <div style={s.segment((w.critical / total) * barHeight, SEV.CRITICAL.c)} />}
              </div>
            </div>
          );
        })}
      </div>
      <div style={s.legend}>
        {(["CRITICAL", "WARNING", "SUGGESTION"] as const).map((sev) => (
          <span key={sev} style={s.legendItem}>
            <span style={s.legendDot(SEV[sev].c)} />
            {SEV[sev].label}
          </span>
        ))}
      </div>
    </div>
  );
}
