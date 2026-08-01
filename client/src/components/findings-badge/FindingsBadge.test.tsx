/**
 * FindingsCell — the PR list's FINDINGS column and the timeline's per-run
 * counters. Two things carry the feature: the counters must not overstate (no
 * "0" for a severity with nothing, no count for a dismissed finding), and the
 * click must not bubble into the surrounding row, which routes elsewhere.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import common from "../../../messages/en/common.json";
import { FindingsCell } from "./FindingsCell";
import { countersOf, countsOfFindings, fileLabel, sortBySeverity, totalOf } from "./helpers";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query under load",
    file: "src/api/users.ts",
    start_line: 46,
    end_line: 46,
    rationale: "A per-row query inside a loop; batch it with a single IN clause.",
    suggestion: null,
    confidence: 0.86,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function renderCell(props: Partial<React.ComponentProps<typeof FindingsCell>> = {}) {
  const onOpen = props.onOpen ?? vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <FindingsCell
        counts={{ critical: 0, warning: 1, suggestion: 2 }}
        findings={[finding({})]}
        onOpen={onOpen}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { ...utils, onOpen };
}

describe("FindingsCell — counters", () => {
  it("renders one counter per non-zero severity", () => {
    renderCell({ counts: { critical: 2, warning: 1, suggestion: 0 } });
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    // The zeroed suggestion count must not appear — "💡 0" reads as a finding.
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows '—' when the PR has no findings, never a bare 0", () => {
    renderCell({ counts: null });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows '—' when every severity is zero", () => {
    renderCell({ counts: { critical: 0, warning: 0, suggestion: 0 } });
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("FindingsCell — interaction", () => {
  it("clicking opens the findings view WITHOUT bubbling to the surrounding row", () => {
    // The PR list row is itself a click target that routes to the Overview tab;
    // if this event bubbles the reader lands on the wrong tab.
    const rowClick = vi.fn();
    const onOpen = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <div onClick={rowClick}>
          <FindingsCell
            counts={{ critical: 1, warning: 0, suggestion: 0 }}
            findings={[finding({ severity: "CRITICAL" })]}
            onOpen={onOpen}
          />
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(rowClick).not.toHaveBeenCalled();
  });

  it("hovering opens a card previewing the findings", () => {
    vi.useFakeTimers();
    try {
      renderCell({
        findings: [
          finding({ id: "f1", title: "N+1 query under load" }),
          finding({
            id: "f2",
            title: "Extract magic number",
            severity: "SUGGESTION",
            file: "src/util/time.ts",
            start_line: 8,
            end_line: 8,
          }),
        ],
      });
      expect(screen.queryByText("N+1 query under load")).not.toBeInTheDocument();
      fireEvent.mouseEnter(screen.getByRole("button"));
      act(() => void vi.advanceTimersByTime(200));
      expect(screen.getByText("2 findings")).toBeInTheDocument();
      expect(screen.getByText("N+1 query under load")).toBeInTheDocument();
      expect(screen.getByText("src/api/users.ts:46")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("collapses the tail of a long findings list into '+N more'", () => {
    vi.useFakeTimers();
    try {
      renderCell({
        counts: { critical: 0, warning: 5, suggestion: 0 },
        findings: [1, 2, 3, 4, 5].map((n) => finding({ id: `f${n}`, title: `Finding ${n}` })),
      });
      fireEvent.mouseEnter(screen.getByRole("button"));
      act(() => void vi.advanceTimersByTime(200));
      expect(screen.getByText("+2 more")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("findings-badge helpers", () => {
  it("countersOf drops zeroed severities and keeps the worst first", () => {
    expect(countersOf({ critical: 1, warning: 0, suggestion: 3 })).toEqual([
      { severity: "CRITICAL", count: 1 },
      { severity: "SUGGESTION", count: 3 },
    ]);
    expect(countersOf(null)).toEqual([]);
  });

  it("totalOf sums the three severities", () => {
    expect(totalOf({ critical: 1, warning: 2, suggestion: 3 })).toBe(6);
    expect(totalOf(null)).toBe(0);
  });

  it("countsOfFindings skips dismissed findings, matching the server rollup", () => {
    const counts = countsOfFindings([
      finding({ id: "a", severity: "CRITICAL" }),
      finding({ id: "b", severity: "CRITICAL", dismissed_at: "2026-07-01T00:00:00Z" }),
      finding({ id: "c", severity: "SUGGESTION" }),
    ]);
    expect(counts).toEqual({ critical: 1, warning: 0, suggestion: 1 });
  });

  it("sortBySeverity puts blockers first and drops dismissed findings", () => {
    const sorted = sortBySeverity([
      finding({ id: "a", severity: "SUGGESTION" }),
      finding({ id: "b", severity: "CRITICAL" }),
      finding({ id: "c", severity: "WARNING", dismissed_at: "2026-07-01T00:00:00Z" }),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["b", "a"]);
  });

  it("fileLabel renders a single line plainly and a span as a range", () => {
    expect(fileLabel({ file: "a.ts", start_line: 46, end_line: 46 })).toBe("a.ts:46");
    expect(fileLabel({ file: "a.ts", start_line: 46, end_line: 52 })).toBe("a.ts:46-52");
  });
});
