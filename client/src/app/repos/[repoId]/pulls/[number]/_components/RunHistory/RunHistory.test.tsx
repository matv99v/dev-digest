/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import messages from "@/../messages/en/prReview.json";
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
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function renderRuns(
  runs: RunSummary[],
  extra?: {
    findingsByRun?: Map<string, FindingRecord[]>;
    onGoToReview?: (runId: string, opts?: { severity?: string; findingId?: string }) => void;
  },
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} {...extra} />
    </NextIntlClientProvider>,
  );
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

describe("RunHistory — cost badge", () => {
  it("a settled run shows its tokens and cost", () => {
    renderRuns([
      run({ status: "done", tokens_in: 8000, tokens_out: 1119, cost_usd: 0.0013, score: 88 }),
    ]);
    expect(screen.getByText("9,119 tok")).toBeInTheDocument();
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("a settled run with no stored cost shows '—', never '$0.00'", () => {
    renderRuns([run({ status: "done", cost_usd: null, score: 88 })]);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("an unsettled run shows no cost badge at all", () => {
    renderRuns([run({ status: "running", cost_usd: null, score: null, blockers: null })]);
    expect(screen.queryByText(/tok$/)).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});

describe("RunHistory — severity counters", () => {
  it("a settled run WITH a findingsByRun entry shows counters instead of plain text", () => {
    const findingsByRun = new Map([
      ["run-1", [finding({ id: "f1", severity: "CRITICAL" }), finding({ id: "f2", severity: "WARNING" })]],
    ]);
    renderRuns([run({ status: "done", findings_count: 2, blockers: 1, score: 40 })], { findingsByRun });
    expect(screen.getByLabelText("1 Critical")).toBeInTheDocument();
    expect(screen.getByLabelText("1 Warning")).toBeInTheDocument();
    expect(screen.queryByText("2 finding(s)")).not.toBeInTheDocument();
    expect(screen.getByText(/1 blocker/)).toBeInTheDocument();
  });

  it("a settled run with NO findingsByRun entry keeps the plain-text fallback", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
  });

  it("clicking a severity counter calls onGoToReview with the run id + severity", () => {
    const findingsByRun = new Map([["run-1", [finding({ severity: "CRITICAL" })]]]);
    const onGoToReview = vi.fn();
    renderRuns([run({ status: "done", score: 40 })], { findingsByRun, onGoToReview });
    fireEvent.click(screen.getByLabelText("1 Critical"));
    expect(onGoToReview).toHaveBeenCalledWith("run-1", { severity: "CRITICAL" });
  });

  it("clicking a finding in the hover preview calls onGoToReview with the finding id", () => {
    const findingsByRun = new Map([["run-1", [finding({ id: "f-critical", severity: "CRITICAL", title: "Hardcoded secret" })]]]);
    const onGoToReview = vi.fn();
    renderRuns([run({ status: "done", score: 40 })], { findingsByRun, onGoToReview });
    fireEvent.mouseEnter(screen.getByLabelText("1 Critical").parentElement!.parentElement!);
    fireEvent.click(screen.getByText("Hardcoded secret"));
    expect(onGoToReview).toHaveBeenCalledWith("run-1", { findingId: "f-critical" });
  });
});
