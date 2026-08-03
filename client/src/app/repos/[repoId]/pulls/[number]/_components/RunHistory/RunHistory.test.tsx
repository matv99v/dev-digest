/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    cost_usd: null,
    ...o,
  };
}

function renderRuns(
  runs: RunSummary[],
  extra: Partial<React.ComponentProps<typeof RunHistory>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} {...extra} />
    </NextIntlClientProvider>,
  );
}

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal string starting with sk_live_.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — severity counters", () => {
  const withFindings = new Map<string, FindingRecord[]>([
    [
      "run-1",
      [
        finding({ id: "f1", severity: "CRITICAL" }),
        finding({ id: "f2", severity: "CRITICAL", title: "Untrusted input reaches exfil path" }),
        finding({ id: "f3", severity: "WARNING", title: "Retry-After header omitted on 429" }),
      ],
    ],
  ]);

  it("breaks the run's findings down by severity instead of one flat total", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 2, score: 38 })], {
      findingsByRun: withFindings,
    });
    expect(screen.getByText("2")).toBeInTheDocument(); // 2 critical
    expect(screen.getByText("1")).toBeInTheDocument(); // 1 warning
    expect(screen.queryByText("3 finding(s)")).not.toBeInTheDocument();
    // The blocker count keeps its place beside the breakdown.
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });

  it("clicking a counter jumps to that run's review accordion", () => {
    const onGoToReview = vi.fn();
    renderRuns([run({ status: "done", findings_count: 3, blockers: 2, score: 38 })], {
      findingsByRun: withFindings,
      onGoToReview,
    });
    fireEvent.click(screen.getByLabelText("3 findings"));
    expect(onGoToReview).toHaveBeenCalledWith("run-1");
  });

  it("falls back to the plain total when the run's findings aren't available", () => {
    // A run whose review was deleted keeps its denormalized count but has no
    // findings to break down — it must still say how many it found.
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })], {
      findingsByRun: new Map(),
    });
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
  });
});

describe("RunHistory — cost badge", () => {
  it("a settled run shows total tokens and cost", () => {
    renderRuns([
      run({ status: "done", tokens_in: 8000, tokens_out: 1119, cost_usd: 0.0013 }),
    ]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("a run with no cost recorded shows '—', NOT '$0.00'", () => {
    renderRuns([run({ status: "done", tokens_in: 8000, tokens_out: 1119, cost_usd: null })]);
    expect(screen.getByText("9,119 tok · —")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it("a failed run shows no cost badge at all", () => {
    renderRuns([run({ status: "failed", error: "boom", cost_usd: null })]);
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
