import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Convention } from "@devdigest/shared";
import messages from "@/../messages/en/conventions.json";

const mutate = vi.fn();

vi.mock("../../../../../../lib/hooks", () => ({
  useUpdateConvention: () => ({ mutate, mutateAsync: vi.fn(), isPending: false, variables: undefined }),
}));

import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CONVENTION: Convention = {
  id: "c1",
  repo_id: "r1",
  category: "naming",
  rule: "Hooks live under src/lib/hooks, one file per domain.",
  evidence: {
    path: "src/lib/hooks/skills.ts",
    line_start: 15,
    line_end: 20,
    snippet: "export function useSkills() {\n  return useQuery(...);\n}",
  },
  confidence: 0.88,
  status: "pending",
  skill_id: null,
  scanned_sha: "abc123",
  created_at: "2026-08-01T00:00:00.000Z",
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders rule + evidence + confidence in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <ConventionCard convention={CONVENTION} repoFullName="acme/widgets" defaultBranch="main" />
        </div>,
      );
      expect(
        screen.getByText("Hooks live under src/lib/hooks, one file per domain."),
      ).toBeInTheDocument();
      expect(screen.getByText("src/lib/hooks/skills.ts:15-20")).toBeInTheDocument();
      expect(screen.getByText("88% conf")).toBeInTheDocument();
    });
  });

  it("Accept calls the mutation with status: accepted", () => {
    renderWithIntl(
      <ConventionCard convention={CONVENTION} repoFullName="acme/widgets" defaultBranch="main" />,
    );
    fireEvent.click(screen.getByText("Accept as Skill"));
    expect(mutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "accepted" } });
  });

  it("Reject calls the mutation with status: rejected", () => {
    renderWithIntl(
      <ConventionCard convention={CONVENTION} repoFullName="acme/widgets" defaultBranch="main" />,
    );
    fireEvent.click(screen.getByText("Reject"));
    expect(mutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "rejected" } });
  });

  it("edit-and-save calls the mutation with the new rule text", () => {
    renderWithIntl(
      <ConventionCard convention={CONVENTION} repoFullName="acme/widgets" defaultBranch="main" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    const input = screen.getByDisplayValue("Hooks live under src/lib/hooks, one file per domain.");
    fireEvent.change(input, { target: { value: "New rule text." } });
    fireEvent.click(screen.getByText("Save"));
    expect(mutate).toHaveBeenCalledWith(
      { id: "c1", patch: { rule: "New rule text." } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
