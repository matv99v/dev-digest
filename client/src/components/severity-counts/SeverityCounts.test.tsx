import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SeverityCounts } from "./SeverityCounts";
import { countBySeverity } from "./helpers";
import type { FindingRecord } from "@devdigest/shared";

afterEach(cleanup);

function finding(severity: FindingRecord["severity"]): FindingRecord {
  return {
    id: `f-${severity}-${Math.random()}`,
    severity,
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

describe("countBySeverity", () => {
  it("groups a flat findings list, zero-filled", () => {
    expect(
      countBySeverity([finding("CRITICAL"), finding("CRITICAL"), finding("WARNING")]),
    ).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 });
  });
});

describe("SeverityCounts", () => {
  it("renders a dash when there are no findings", () => {
    render(<SeverityCounts counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders a dash for null counts", () => {
    render(<SeverityCounts counts={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders only non-zero severities as plain text without onSelect", () => {
    render(<SeverityCounts counts={{ CRITICAL: 2, WARNING: 0, SUGGESTION: 1 }} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders clickable buttons and fires onSelect with the severity", () => {
    const onSelect = vi.fn();
    render(<SeverityCounts counts={{ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }} onSelect={onSelect} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("2 Critical"));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });
});
