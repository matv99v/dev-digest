/**
 * RunCostBadge — the feature's central rule is that MISSING cost data reads
 * "—", never "$0.00": the first says "we don't know", the second claims the run
 * was free. These guard that distinction, plus the two rendering variants.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { RunCostBadge } from "./RunCostBadge";
import { formatCost, formatTokenCount } from "./helpers";

afterEach(cleanup);

function renderBadge(props: React.ComponentProps<typeof RunCostBadge>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <RunCostBadge {...props} />
    </NextIntlClientProvider>,
  );
}

describe("RunCostBadge — variants", () => {
  it("compact shows cost alone", () => {
    renderBadge({ costUsd: 0.0141 });
    expect(screen.getByText("$0.0141")).toBeInTheDocument();
  });

  // Regression: at 3 decimals this rendered "<$0.001", making the PR list less
  // precise than the timeline showing the same run, for a wholly ordinary cost.
  it("shows a sub-tenth-of-a-cent total exactly, not as a floor marker", () => {
    renderBadge({ costUsd: 0.0006 });
    expect(screen.getByText("$0.0006")).toBeInTheDocument();
    expect(screen.queryByText(/^</)).not.toBeInTheDocument();
  });

  it("renders both variants at the same cost precision", () => {
    renderBadge({ costUsd: 0.0006 });
    renderBadge({ variant: "detailed", costUsd: 0.0006, tokensIn: 3831, tokensOut: 0 });
    expect(screen.getByText("$0.0006")).toBeInTheDocument();
    expect(screen.getByText("3,831 tok · $0.0006")).toBeInTheDocument();
  });

  it("detailed shows summed tokens then cost, at finer precision", () => {
    renderBadge({ variant: "detailed", costUsd: 0.0013, tokensIn: 8000, tokensOut: 1119 });
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("detailed with no usage recorded collapses to a lone dash", () => {
    renderBadge({ variant: "detailed", costUsd: null });
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("RunCostBadge — unknown cost is never $0.00", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("renders '—' for %s", (_label, value) => {
    renderBadge({ costUsd: value as number | null | undefined });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("a genuine zero still prints as a number, so it stays distinguishable", () => {
    renderBadge({ costUsd: 0 });
    expect(screen.getByText("$0.0000")).toBeInTheDocument();
  });
});

describe("formatCost", () => {
  it("floors only below the smallest representable value, never rounding to $0.0000", () => {
    expect(formatCost(0.0006)).toBe("$0.0006");
    expect(formatCost(0.00004)).toBe("<$0.0001");
  });

  it("treats non-finite values as unknown", () => {
    expect(formatCost(Number.NaN)).toBe("—");
    expect(formatCost(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatTokenCount", () => {
  it("sums both directions and groups thousands", () => {
    expect(formatTokenCount(8000, 1119)).toBe("9,119");
  });

  it("counts a recorded zero, but reports nothing when both are absent", () => {
    expect(formatTokenCount(0, 0)).toBe("0");
    expect(formatTokenCount(null, null)).toBeNull();
  });
});
