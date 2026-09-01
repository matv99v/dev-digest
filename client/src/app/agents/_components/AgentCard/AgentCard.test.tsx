import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "@/../messages/en/agents.json";
import { AgentCard } from "./AgentCard";

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

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("renders the stats footer when stats are supplied", () => {
    renderWithIntl(
      <AgentCard
        ag={AGENT}
        stats={{ agent_id: "ag1", runs_30d: 142, accept_rate: 0.78, avg_cost_usd: 0.04 }}
      />,
    );
    expect(screen.getByText("142 runs")).toBeInTheDocument();
    expect(screen.getByText("78% accept")).toBeInTheDocument();
    expect(screen.getByText("$0.04 avg")).toBeInTheDocument();
  });

  it("renders '—' for a null accept rate / cost, never 0%/$0.00", () => {
    renderWithIntl(
      <AgentCard
        ag={AGENT}
        stats={{ agent_id: "ag1", runs_30d: 0, accept_rate: null, avg_cost_usd: null }}
      />,
    );
    expect(screen.getByText("— accept")).toBeInTheDocument();
    expect(screen.getByText("— avg")).toBeInTheDocument();
  });

  it("omits the stats footer entirely when no stats are supplied", () => {
    renderWithIntl(<AgentCard ag={AGENT} />);
    expect(screen.queryByText(/accept$/)).not.toBeInTheDocument();
  });

  it("has no delete button unless onDelete is supplied", () => {
    renderWithIntl(<AgentCard ag={AGENT} />);
    expect(screen.queryByLabelText("Delete agent")).not.toBeInTheDocument();
  });

  it("renders the delete button and calls onDelete when confirmed", () => {
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    const onDelete = vi.fn();
    renderWithIntl(<AgentCard ag={AGENT} onDelete={onDelete} />);
    const btn = screen.getByLabelText("Delete agent");
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(onDelete).toHaveBeenCalledTimes(1);
    window.confirm = originalConfirm;
  });
});
