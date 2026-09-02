import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Convention, ConventionScan } from "@devdigest/shared";
import conventionsMessages from "@/../messages/en/conventions.json";
import skillsMessages from "@/../messages/en/skills.json";

const extractMutate = vi.fn();
let scan: ConventionScan;

vi.mock("../../../../../../lib/hooks", () => ({
  useConventions: () => ({ data: scan, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: extractMutate, isPending: false }),
  useUpdateConvention: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, variables: undefined }),
  useConventionSkillDraft: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateConventionSkills: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: { id: "r1", full_name: "acme/widgets", default_branch: "main" },
  }),
}));

import { ConventionsView } from "./ConventionsView";

afterEach(cleanup);

function convention(overrides: Partial<Convention>): Convention {
  return {
    id: overrides.id ?? "c1",
    repo_id: "r1",
    category: "naming",
    rule: "Rule text",
    evidence: { path: "src/a.ts", line_start: 1, line_end: 1, snippet: "code" },
    confidence: 0.8,
    status: "pending",
    skill_id: null,
    scanned_sha: "abc123",
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ conventions: conventionsMessages, skills: skillsMessages }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ConventionsView", () => {
  it("renders the empty state when there are no candidates", () => {
    scan = { candidates: [], sampled_files: 0, dropped_unverified: 0, scanned_sha: null, scanned_at: null };
    renderWithIntl(<ConventionsView repoId="r1" />);
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
  });

  it("the extract button triggers the extraction mutation", () => {
    scan = { candidates: [], sampled_files: 0, dropped_unverified: 0, scanned_sha: null, scanned_at: null };
    renderWithIntl(<ConventionsView repoId="r1" />);
    const buttons = screen.getAllByRole("button", { name: "Run extraction" });
    fireEvent.click(buttons[0]!);
    expect(extractMutate).toHaveBeenCalledWith("r1");
  });

  it("the accepted count reflects accepted vs. total candidates", () => {
    scan = {
      candidates: [
        convention({ id: "1", status: "accepted" }),
        convention({ id: "2", status: "accepted" }),
        convention({ id: "3", status: "pending" }),
        convention({ id: "4", status: "pending" }),
        convention({ id: "5", status: "rejected" }),
      ],
      sampled_files: 20,
      dropped_unverified: 0,
      scanned_sha: "abc123",
      scanned_at: null,
    };
    renderWithIntl(<ConventionsView repoId="r1" />);
    expect(screen.getByText("2 of 5 accepted")).toBeInTheDocument();
    expect(screen.getByText("Deselect all")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).not.toBeDisabled();
  });
});
