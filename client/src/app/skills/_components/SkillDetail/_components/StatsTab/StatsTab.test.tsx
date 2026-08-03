import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

let STATS: SkillStats | undefined;
vi.mock("@/lib/hooks/skills", () => ({
  useSkillStats: () => ({ data: STATS, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { StatsTab } from "./StatsTab";

afterEach(() => {
  cleanup();
  STATS = undefined;
});

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "# Rubric",
  enabled: true,
  version: 3,
  evidence_files: null,
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <StatsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

describe("StatsTab", () => {
  it("shows DB-only metrics: agents used-by, body tokens, and version count", () => {
    STATS = {
      agents_total: 2,
      agents_enabled: 1,
      agents: [
        { id: "ag1", name: "Security Reviewer", link_enabled: true },
        { id: "ag2", name: "Performance Reviewer", link_enabled: false },
      ],
      versions: 3,
      tokens: 412,
      last_changed_at: "2026-02-01T00:00:00.000Z",
    };
    renderTab();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Performance Reviewer")).toBeInTheDocument();
    expect(screen.getByText("412")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it('marks a linked agent whose LINK is disabled with "disabled for this agent"', () => {
    STATS = {
      agents_total: 1,
      agents_enabled: 0,
      agents: [{ id: "ag2", name: "Performance Reviewer", link_enabled: false }],
      versions: 1,
      tokens: 50,
      last_changed_at: null,
    };
    renderTab();
    expect(screen.getByText("disabled for this agent")).toBeInTheDocument();
  });

  it("does not render a Donut/percentage findings-by-category chart — only the DB-backed metric tiles and an explanatory note", () => {
    STATS = { agents_total: 0, agents_enabled: 0, agents: [], versions: 1, tokens: 10, last_changed_at: null };
    renderTab();
    // No fabricated percentage stat (e.g. "74%") anywhere in the tab.
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.getByText(/eval pipeline/i)).toBeInTheDocument();
  });

  it("shows an empty state when the skill isn't linked to any agent", () => {
    STATS = { agents_total: 0, agents_enabled: 0, agents: [], versions: 1, tokens: 10, last_changed_at: null };
    renderTab();
    expect(screen.getByText("Not linked to any agent yet.")).toBeInTheDocument();
  });
});
