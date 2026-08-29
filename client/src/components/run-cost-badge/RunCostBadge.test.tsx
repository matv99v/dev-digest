/**
 * RunCostBadge — the money formatting is the part that breaks, so it is tested
 * directly. Two rules matter: a sub-cent run must not round away to "$0.00",
 * and a run with NO cost data must read "—" (never a fabricated zero).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";
import { formatCostUsd, formatTokenCount } from "./helpers";

afterEach(cleanup);

describe("formatCostUsd", () => {
  it("keeps sub-cent precision and trims to a 2-decimal floor", () => {
    expect(formatCostUsd(0.0013)).toBe("$0.0013");
    expect(formatCostUsd(0.014)).toBe("$0.014");
    expect(formatCostUsd(0.06)).toBe("$0.06");
    expect(formatCostUsd(1.5)).toBe("$1.50");
  });

  it("renders '—' for missing data but '$0.00' for a genuinely free run", () => {
    expect(formatCostUsd(null)).toBe("—");
    expect(formatCostUsd(undefined)).toBe("—");
    expect(formatCostUsd(0)).toBe("$0.00");
  });

  it("flags a cost too small to render rather than rounding it to zero", () => {
    expect(formatCostUsd(0.00002)).toBe("<$0.0001");
  });
});

describe("formatTokenCount", () => {
  it("totals in+out with thousands separators", () => {
    expect(formatTokenCount(8000, 1119)).toBe("9,119");
    expect(formatTokenCount(null, null)).toBe("0");
  });
});

describe("RunCostBadge", () => {
  it("compact renders the figure alone", () => {
    render(<RunCostBadge costUsd={0.014} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("detailed renders tokens · cost", () => {
    render(<RunCostBadge variant="detailed" costUsd={0.0013} tokensIn={8000} tokensOut={1119} />);
    expect(screen.getByText("9,119 tok")).toBeInTheDocument();
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("detailed still shows tokens when the cost is unknown", () => {
    render(<RunCostBadge variant="detailed" costUsd={null} tokensIn={8000} tokensOut={457} />);
    expect(screen.getByText("8,457 tok")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
