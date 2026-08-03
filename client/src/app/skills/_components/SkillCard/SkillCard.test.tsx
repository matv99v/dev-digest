import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Rubric for evaluating overall PR quality.",
  type: "rubric",
  source: "manual",
  body: "# PR Quality Rubric",
  enabled: true,
  version: 5,
  evidence_files: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders the name, type badge, and manual source badge", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it('shows a "needs vetting" badge for a non-manual source', () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, source: "imported_file" }} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it('does NOT show "needs vetting" for a manually-authored skill', () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("renders the agents-count and version footer only when agentsCount is provided", () => {
    const { rerender } = renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.queryByText("v5")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillCard skill={SKILL} agentsCount={3} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("v5")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
  });
});
