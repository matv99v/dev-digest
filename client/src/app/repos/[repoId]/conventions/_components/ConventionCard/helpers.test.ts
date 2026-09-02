import { describe, it, expect } from "vitest";
import type { ConventionEvidence } from "@devdigest/shared";
import { evidenceLineLabel, conventionEvidenceHref } from "./helpers";

describe("evidenceLineLabel", () => {
  it("renders a single number when start === end", () => {
    expect(evidenceLineLabel({ line_start: 11, line_end: 11 })).toBe("11");
  });

  it("renders a range when start !== end", () => {
    expect(evidenceLineLabel({ line_start: 11, line_end: 15 })).toBe("11-15");
  });
});

describe("conventionEvidenceHref", () => {
  const evidence: ConventionEvidence = {
    path: "src/lib/api.ts",
    line_start: 20,
    line_end: 24,
    snippet: "export const api = {...}",
  };

  it("pins to the scan's sha when present", () => {
    expect(conventionEvidenceHref("acme/widgets", "abc123", "main", evidence)).toBe(
      "https://github.com/acme/widgets/blob/abc123/src/lib/api.ts#L20-L24",
    );
  });

  it("falls back to the repo's default branch when scanned_sha is null", () => {
    expect(conventionEvidenceHref("acme/widgets", null, "main", evidence)).toBe(
      "https://github.com/acme/widgets/blob/main/src/lib/api.ts#L20-L24",
    );
  });
});
