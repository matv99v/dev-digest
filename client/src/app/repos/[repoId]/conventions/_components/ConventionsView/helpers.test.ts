import { describe, it, expect } from "vitest";
import type { Convention } from "@devdigest/shared";
import { acceptedSummary, formatScanTime } from "./helpers";

function convention(overrides: Partial<Convention>): Convention {
  return {
    id: "c1",
    repo_id: "r1",
    category: null,
    rule: "rule",
    evidence: { path: "a.ts", line_start: 1, line_end: 1, snippet: "" },
    confidence: 0.9,
    status: "pending",
    skill_id: null,
    scanned_sha: null,
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("acceptedSummary", () => {
  it("counts accepted candidates against the total", () => {
    const candidates = [
      convention({ id: "1", status: "accepted" }),
      convention({ id: "2", status: "pending" }),
      convention({ id: "3", status: "rejected" }),
      convention({ id: "4", status: "accepted" }),
    ];
    expect(acceptedSummary(candidates)).toEqual({ accepted: 2, total: 4 });
  });

  it("returns zeros for an empty list", () => {
    expect(acceptedSummary([])).toEqual({ accepted: 0, total: 0 });
  });
});

describe("formatScanTime", () => {
  it("formats a valid ISO timestamp", () => {
    const out = formatScanTime("2026-08-01T00:00:00.000Z");
    expect(out).not.toBe("2026-08-01T00:00:00.000Z");
    expect(out.length).toBeGreaterThan(0);
  });

  it("falls back to the raw string for an unparsable value", () => {
    expect(formatScanTime("not-a-date")).toBe("not-a-date");
  });
});
