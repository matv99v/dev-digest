import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile, SmartDiffGroup } from "@/lib/types";
import messages from "@/../messages/en/shell.json";

import { SmartDiffViewer } from "./SmartDiffViewer";

// jsdom does not implement scrollIntoView (client/INSIGHTS.md, 2026-09-01's
// vi.mock rule is the sibling gotcha; this is the plan's second one, named in
// T10's Risk) — stub it or R13's assertion throws rather than fails.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ shell: messages }}>{ui}</NextIntlClientProvider>);
}

// -- Fixtures --------------------------------------------------------------

// Hunk header `@@ -1,2 +1,3 @@` starts old/new numbering at 1; the two `+`
// lines land on new-line-numbers 2 and 3 (parsePatch's own numbering). Each
// file gets distinct patch text so an assertion about one file's lines can't
// pass because of a same-text line rendered by another file.
const PATCH_SERVICE = [
  "@@ -1,2 +1,3 @@",
  " context line",
  "+service added one",
  "+service added two",
  "-service removed",
].join("\n");
const PATCH_LOCK = [
  "@@ -1,2 +1,3 @@",
  " context line",
  "+lock added one",
  "+lock added two",
  "-lock removed",
].join("\n");
const PATCH_BIG = ["@@ -1,1 +1,2 @@", " context", "+big marker text line"].join("\n");

const FILES: PrFile[] = [
  { path: "src/service.ts", additions: 2, deletions: 1, patch: PATCH_SERVICE },
  { path: "pnpm-lock.yaml", additions: 2, deletions: 1, patch: PATCH_LOCK },
  { path: "src/big.ts", additions: 300, deletions: 0, patch: PATCH_BIG },
];

const GROUPS: SmartDiffGroup[] = [
  {
    role: "core",
    files: [
      { path: "src/service.ts", pseudocode_summary: null, additions: 2, deletions: 1, finding_lines: [2] },
      { path: "src/big.ts", pseudocode_summary: null, additions: 300, deletions: 0, finding_lines: [] },
      // Not in FILES — R10's "skips a path absent from files".
      { path: "src/missing.ts", pseudocode_summary: null, additions: 5, deletions: 0, finding_lines: [] },
    ],
  },
  { role: "wiring", files: [] },
  {
    role: "boilerplate",
    files: [
      {
        path: "pnpm-lock.yaml",
        pseudocode_summary: "should never render",
        additions: 2,
        deletions: 1,
        finding_lines: [2],
      },
    ],
  },
];

function mkFinding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "bug",
    title: "A finding",
    file: "src/service.ts",
    start_line: 2,
    end_line: 2,
    rationale: "because",
    suggestion: null,
    confidence: 0.9,
    kind: null,
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

describe("SmartDiffViewer", () => {
  it("renders title, description and count per non-empty group, and omits an empty group", () => {
    renderWithIntl(<SmartDiffViewer groups={GROUPS} files={FILES} findings={[]} />);

    expect(screen.getByText("Core logic")).toBeInTheDocument();
    expect(screen.getByText("The substance of the change — review closely")).toBeInTheDocument();
    // Only 2 of the 3 core entries join a real PrFile (src/missing.ts doesn't).
    expect(screen.getByText("2 files")).toBeInTheDocument();

    expect(screen.getByText("Boilerplate")).toBeInTheDocument();
    expect(screen.getByText("1 files")).toBeInTheDocument();

    // The "wiring" group has no files at all — no heading for it.
    expect(screen.queryByText("Wiring")).not.toBeInTheDocument();
  });

  it("skips a path absent from files and renders patch lines for a joined file", () => {
    renderWithIntl(
      <SmartDiffViewer
        groups={GROUPS}
        files={FILES}
        findings={[mkFinding({ id: "f-critical" })]}
      />,
    );

    expect(screen.queryByText("src/missing.ts")).not.toBeInTheDocument();
    // src/service.ts has a finding on line 2, so it starts expanded (R11) —
    // its patch lines are visible without any interaction.
    expect(screen.getByText("service added one")).toBeInTheDocument();
  });

  it("renders no summary line for a file, even when the fixture supplies one", () => {
    renderWithIntl(<SmartDiffViewer groups={GROUPS} files={FILES} findings={[]} />);

    expect(screen.queryByText("should never render")).not.toBeInTheDocument();
  });

  it("a boilerplate file with findings starts collapsed, a core file with findings starts expanded, and a large core file with no findings starts collapsed", () => {
    renderWithIntl(
      <SmartDiffViewer
        groups={GROUPS}
        files={FILES}
        findings={[mkFinding({ id: "f-critical" }), mkFinding({ id: "f-lock", file: "pnpm-lock.yaml" })]}
      />,
    );

    // core, with findings → expanded.
    expect(screen.getByText("service added one")).toBeInTheDocument();
    // boilerplate, with findings → collapsed regardless (R11).
    expect(screen.queryByText("lock added one")).not.toBeInTheDocument();
    // large core file, no findings → default AUTO_EXPAND_MAX_LINES rule (collapsed).
    expect(screen.queryByText("big marker text line")).not.toBeInTheDocument();
  });

  // Regression: `boilerplate` used to be collapsed only when it HAD findings,
  // so a lock-file — which normally carries none — was expanded whenever it
  // came in under AUTO_EXPAND_MAX_LINES. That is the one file Smart order most
  // needs shut, so the role now wins outright.
  it("a boilerplate file with no findings still starts collapsed, however small", () => {
    renderWithIntl(
      <SmartDiffViewer
        groups={[
          {
            role: "boilerplate",
            files: [
              { path: "pnpm-lock.yaml", pseudocode_summary: null, additions: 2, deletions: 1, finding_lines: [] },
            ],
          },
        ]}
        files={FILES}
        findings={[]}
      />,
    );

    // 3 changed lines — far under AUTO_EXPAND_MAX_LINES, so the size rule alone
    // would have opened it.
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
    expect(screen.queryByText("lock added one")).not.toBeInTheDocument();
  });

  it("a CRITICAL finding's line renders the Critical marker, a line covered by WARNING and CRITICAL renders Critical only, and an unmarked line renders no marker", () => {
    renderWithIntl(
      <SmartDiffViewer
        groups={GROUPS}
        files={FILES}
        findings={[
          mkFinding({ id: "f-critical", severity: "CRITICAL", start_line: 2, end_line: 2 }),
          mkFinding({ id: "f-warning", severity: "WARNING", start_line: 2, end_line: 2 }),
        ]}
      />,
    );

    // Line 2 is covered by both — highest severity (Critical) wins, and only once.
    expect(screen.getAllByText("Critical")).toHaveLength(1);
    expect(screen.queryByText("Warning")).not.toBeInTheDocument();
    // Line 3 ("service added two") carries no finding — it renders, but with
    // no marker text at all beyond the one Critical marker asserted above.
    expect(screen.getByText("service added two")).toBeInTheDocument();
  });

  it("a badge click expands a collapsed boilerplate file and scrolls to its first marked line, and a second click scrolls again", async () => {
    renderWithIntl(
      <SmartDiffViewer
        groups={GROUPS}
        files={FILES}
        findings={[mkFinding({ id: "f-lock", file: "pnpm-lock.yaml", start_line: 2, end_line: 2 })]}
      />,
    );

    // Starts collapsed (R11) — its patch isn't rendered yet.
    expect(screen.queryByText("lock added one")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1 finding(s) in pnpm-lock.yaml" }));

    expect(screen.getByText("lock added one")).toBeInTheDocument();
    // The scroll runs off a requestAnimationFrame, not synchronously with the
    // click — wait for it rather than asserting immediately.
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "1 finding(s) in pnpm-lock.yaml" }));
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2));
  });

  // Regression: expanding used to work by flipping the FileCard's React `key`,
  // which remounted the subtree and discarded everything it held — an unsent
  // InlineComposer draft above all. `open` is a controlled prop now, so the
  // click must reuse the very same DOM nodes.
  it("a badge click does not remount the file's subtree", async () => {
    renderWithIntl(
      <SmartDiffViewer groups={GROUPS} files={FILES} findings={[mkFinding({})]} />,
    );

    // `src/service.ts` is core with findings, so it starts expanded (R11).
    const before = screen.getByText("service added one");

    fireEvent.click(screen.getByRole("button", { name: "1 finding(s) in src/service.ts" }));
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1));

    // Node IDENTITY, not just presence: a remount would replace this element.
    expect(screen.getByText("service added one")).toBe(before);
  });

  it("clicking a file header still toggles it in smart order", () => {
    renderWithIntl(
      <SmartDiffViewer groups={GROUPS} files={FILES} findings={[mkFinding({})]} />,
    );

    expect(screen.getByText("service added one")).toBeInTheDocument();
    fireEvent.click(screen.getByText("src/service.ts"));
    expect(screen.queryByText("service added one")).not.toBeInTheDocument();
  });
});
