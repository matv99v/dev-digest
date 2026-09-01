import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentStatsDetail } from "@devdigest/shared";
import messages from "@/../messages/en/agents.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let mockStats: { data: AgentStatsDetail | undefined; isLoading: boolean };
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentStats: () => mockStats,
}));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const STATS: AgentStatsDetail = {
  agent_id: "ag1",
  runs_30d: 142,
  accept_rate: 0.78,
  avg_cost_usd: 0.04,
  runs_trend: [0, 1, 2, 3],
  avg_cost_delta: -0.01,
  avg_duration_ms: 6200,
  findings_last_30d: 96,
  findings_by_category: { security: 52, bug: 20 },
  findings_by_severity_weekly: [{ week: "2026-05-25", critical: 2, warning: 1, suggestion: 0 }],
  runs: [
    {
      run_id: "r1",
      ran_at: "2026-06-01T09:14:00Z",
      repo_id: "repo1",
      pr_number: 482,
      tokens_in: 12000,
      tokens_out: 4000,
      cost_usd: 0.06,
      duration_ms: 6200,
      findings_count: 3,
      source: "local",
      status: "done",
    },
  ],
};

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ agents: messages }}>{ui}</NextIntlClientProvider>);
}

describe("Agent StatsTab (smoke)", () => {
  it("renders metric tiles and the run history table from real stats", () => {
    mockStats = { data: STATS, isLoading: false };
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("$0.04")).toBeInTheDocument();
    expect(screen.getByText("#482")).toBeInTheDocument();
    expect(screen.getByText("local")).toBeInTheDocument();
  });

  it("renders the empty state when the agent has no runs", () => {
    mockStats = {
      data: { ...STATS, runs_30d: 0, runs: [], accept_rate: null, avg_cost_usd: null, avg_duration_ms: null },
      isLoading: false,
    };
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.getByText("No agent runs yet")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows skeletons while loading", () => {
    mockStats = { data: undefined, isLoading: true };
    const { container } = renderWithIntl(<StatsTab agent={AGENT} />);
    expect(container.querySelector('[class*="skeleton" i], [style]')).toBeTruthy();
    expect(screen.queryByText("Run history")).not.toBeInTheDocument();
  });
});
