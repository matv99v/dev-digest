/**
 * SkillsTab — mocks lib/hooks/skills directly (mirrors ConfigTab.test.tsx /
 * VersionsTab.test.tsx), so the double-gate enabled count, reorder, toggle,
 * and link/unlink flows are simple to control.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const setSkillsMutate = vi.fn();

let LINKS: AgentSkillLink[];
let SKILLS: Skill[];
let LOADING = false;

vi.mock("@/lib/hooks/skills", () => ({
  useAgentSkills: () => ({ data: LOADING ? undefined : LINKS, isLoading: LOADING }),
  useSkills: () => ({ data: LOADING ? undefined : SKILLS, isLoading: LOADING }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  setSkillsMutate.mockClear();
  LOADING = false;
});

const AGENT: Agent = {
  id: "ag1",
  name: "Test Quality Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4o-mini",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
  skill_count: 3,
};

function skill(overrides: Partial<Skill>): Skill {
  return {
    id: "sk-x",
    name: "skill-x",
    description: "",
    type: "convention",
    source: "manual",
    body: "body",
    enabled: true,
    version: 1,
    evidence_files: null,
    ...overrides,
  };
}

function setup() {
  SKILLS = [
    skill({ id: "sk1", name: "uncovered-branch-gate" }),
    skill({ id: "sk2", name: "mock-overuse-gate" }),
    skill({ id: "sk3", name: "flaky-test-smells", enabled: false }), // globally disabled
    skill({ id: "sk4", name: "unlinked-skill" }),
  ];
  LINKS = [
    { agent_id: "ag1", skill_id: "sk1", order: 0, enabled: true },
    { agent_id: "ag1", skill_id: "sk2", order: 1, enabled: false }, // link disabled
    { agent_id: "ag1", skill_id: "sk3", order: 2, enabled: true }, // skill globally disabled
  ];
}

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab", () => {
  it('the "N of M enabled" count only counts links enabled at BOTH gates', () => {
    setup();
    renderTab();
    // sk1: link enabled + skill enabled -> counts. sk2: link disabled -> no.
    // sk3: skill globally disabled -> no, even though its link is enabled.
    expect(screen.getByText("1 of 3 enabled")).toBeInTheDocument();
  });

  it("toggling a link's checkbox flips only that skill's enabled flag", () => {
    setup();
    renderTab();
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]!); // sk2's row (currently disabled)
    expect(setSkillsMutate).toHaveBeenCalledWith({
      agentId: "ag1",
      skills: [
        { skill_id: "sk1", enabled: true },
        { skill_id: "sk2", enabled: true },
        { skill_id: "sk3", enabled: true },
      ],
    });
  });

  it('"Move down" on the first row swaps it with the second and sends the new order', () => {
    setup();
    renderTab();
    fireEvent.click(screen.getAllByLabelText("Move down")[0]!);
    expect(setSkillsMutate).toHaveBeenCalledWith({
      agentId: "ag1",
      skills: [
        { skill_id: "sk2", enabled: false },
        { skill_id: "sk1", enabled: true },
        { skill_id: "sk3", enabled: true },
      ],
    });
  });

  it("unlinking a skill removes it from the sent list, keeping the rest", () => {
    setup();
    renderTab();
    fireEvent.click(screen.getAllByLabelText("Unlink")[1]!); // sk2
    expect(setSkillsMutate).toHaveBeenCalledWith({
      agentId: "ag1",
      skills: [
        { skill_id: "sk1", enabled: true },
        { skill_id: "sk3", enabled: true },
      ],
    });
  });

  it("linking a previously-unlinked skill from the dropdown appends it, enabled, at the end", () => {
    setup();
    renderTab();
    fireEvent.click(screen.getByText("+ Link skill"));
    fireEvent.click(screen.getByText("unlinked-skill"));
    expect(setSkillsMutate).toHaveBeenCalledWith({
      agentId: "ag1",
      skills: [
        { skill_id: "sk1", enabled: true },
        { skill_id: "sk2", enabled: false },
        { skill_id: "sk3", enabled: true },
        { skill_id: "sk4", enabled: true },
      ],
    });
  });

  it("filtering the list is purely visual and never sends a request", () => {
    setup();
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), {
      target: { value: "mock" },
    });
    expect(screen.queryByText("uncovered-branch-gate")).not.toBeInTheDocument();
    expect(screen.getByText("mock-overuse-gate")).toBeInTheDocument();
    expect(setSkillsMutate).not.toHaveBeenCalled();
  });

  it("shows an empty state when nothing is linked", () => {
    setup();
    LINKS = [];
    renderTab();
    expect(screen.getByText("No skills linked")).toBeInTheDocument();
  });

  it("the loading → loaded transition does not change hook order (regression: useRef was declared after an early return)", () => {
    setup();
    LOADING = true;
    const { rerender } = renderTab();
    // Renders null while loading — nothing linked-skill-related on screen yet.
    expect(screen.queryByText("uncovered-branch-gate")).not.toBeInTheDocument();

    LOADING = false;
    // A hook declared after a conditional early-return changes hook count
    // between renders; React throws synchronously on the render that follows.
    expect(() =>
      rerender(
        <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
          <SkillsTab agent={AGENT} />
        </NextIntlClientProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByText("uncovered-branch-gate")).toBeInTheDocument();
  });
});
