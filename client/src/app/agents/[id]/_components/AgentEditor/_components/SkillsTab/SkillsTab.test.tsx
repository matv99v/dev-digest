import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "@/../messages/en/agents.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const SKILLS: Skill[] = [
  {
    id: "s1",
    name: "uncovered-branches",
    description: "Flag untested branches.",
    type: "rubric",
    source: "manual",
    body: "# Uncovered branches",
    enabled: true,
    version: 1,
  },
  {
    id: "s2",
    name: "edge-case-coverage",
    description: "Flag missing boundary tests.",
    type: "rubric",
    source: "manual",
    body: "# Edge case coverage",
    enabled: true,
    version: 1,
  },
  {
    id: "s3",
    name: "pr-quality-rubric",
    description: "General PR quality rubric.",
    type: "rubric",
    source: "manual",
    body: "# PR Quality Rubric",
    enabled: true,
    version: 1,
  },
];

const LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "s2", order: 0 },
  { agent_id: "ag1", skill_id: "s1", order: 1 },
];

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS }),
  useAgentSkillLinks: () => ({ data: LINKS }),
  useSetAgentSkills: () => ({ mutate: vi.fn() }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Test Quality Reviewer",
  description: "Reviews test quality.",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a test-quality reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab (smoke)", () => {
  it("renders linked skills before unlinked ones, in link order", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const names = screen.getAllByText(/^(edge-case-coverage|uncovered-branches|pr-quality-rubric)$/).map(
      (el) => el.textContent,
    );
    // Linked (order 0, 1): edge-case-coverage, uncovered-branches — then unlinked: pr-quality-rubric.
    expect(names).toEqual(["edge-case-coverage", "uncovered-branches", "pr-quality-rubric"]);
  });

  it("renders the {linked} of {total} enabled count", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
  });
});
