import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiffGroup } from "@/lib/types";
import messages from "@/../messages/en/shell.json";

// `DiffTab.tsx` imports `useSmartDiff` from the `@/lib/hooks` barrel and
// `usePrComments`/`useCreatePrComment`/`usePrReviews` from `@/lib/hooks/reviews`
// — both seven levels under src/app, computed with
// `node -e "console.log(require('path').relative(...))"`, not counted by eye
// (client/INSIGHTS.md, 2026-09-01).
const { mockUseSmartDiff, mockUsePrComments, mockUseCreatePrComment, mockUsePrReviews } = vi.hoisted(() => ({
  mockUseSmartDiff: vi.fn(),
  mockUsePrComments: vi.fn(),
  mockUseCreatePrComment: vi.fn(),
  mockUsePrReviews: vi.fn(),
}));

vi.mock("../../../../../../../lib/hooks", () => ({
  useSmartDiff: mockUseSmartDiff,
}));

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  usePrComments: mockUsePrComments,
  useCreatePrComment: mockUseCreatePrComment,
  usePrReviews: mockUsePrReviews,
}));

import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ shell: messages }}>{ui}</NextIntlClientProvider>);
}

const FILES: PrFile[] = [
  { path: "src/a.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n context\n+add a" },
  { path: ".github/workflows/ci.yml", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n context\n+add b" },
  { path: "pnpm-lock.yaml", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n context\n+add c" },
];

const GROUPS: SmartDiffGroup[] = [
  {
    role: "core",
    files: [{ path: "src/a.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] }],
  },
  {
    role: "wiring",
    files: [
      {
        path: ".github/workflows/ci.yml",
        pseudocode_summary: null,
        additions: 1,
        deletions: 0,
        finding_lines: [],
      },
    ],
  },
  {
    role: "boilerplate",
    files: [{ path: "pnpm-lock.yaml", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] }],
  },
];

function setup() {
  mockUsePrComments.mockReturnValue({ data: [] });
  mockUseCreatePrComment.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockUsePrReviews.mockReturnValue({ data: [] });
  mockUseSmartDiff.mockReturnValue({
    data: { groups: GROUPS, split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] } },
  });
}

describe("DiffTab", () => {
  it("defaults to original order and renders DiffViewer", () => {
    setup();
    renderWithIntl(<DiffTab prId="pr1" filesCount={FILES.length} files={FILES} canComment={false} />);

    expect(screen.getByRole("button", { name: "Smart order" })).toBeInTheDocument();
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.queryByText("Wiring")).not.toBeInTheDocument();
    expect(screen.queryByText("Boilerplate")).not.toBeInTheDocument();
  });

  it("toggling to smart order renders the three group headings, and toggling back restores the original list", () => {
    setup();
    renderWithIntl(<DiffTab prId="pr1" filesCount={FILES.length} files={FILES} canComment={false} />);

    const toggle = screen.getByRole("button", { name: "Smart order" });
    fireEvent.click(toggle);

    expect(screen.getByText("Core logic")).toBeInTheDocument();
    expect(screen.getByText("Wiring")).toBeInTheDocument();
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Original order" }));

    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.queryByText("Wiring")).not.toBeInTheDocument();
    expect(screen.queryByText("Boilerplate")).not.toBeInTheDocument();
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
  });
});
