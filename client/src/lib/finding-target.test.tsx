/**
 * The handoff is a ONE-SHOT: it must fire for the PR it was queued for and then
 * be gone, so a later visit to the same PR doesn't yank the reader back to a
 * finding they already dealt with.
 */
import React, { StrictMode } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { setPendingFinding, takePendingFinding, useHandoffFinding } from "./finding-target";

afterEach(cleanup);

describe("finding-target handoff", () => {
  it("hands the finding to the PR it was queued for", () => {
    setPendingFinding(482, "f1");
    expect(takePendingFinding(482)).toBe("f1");
  });

  it("is consumed by the first take — a second one gets nothing", () => {
    setPendingFinding(482, "f1");
    expect(takePendingFinding(482)).toBe("f1");
    expect(takePendingFinding(482)).toBeNull();
  });

  it("does not fire on a different PR, and stays queued for the right one", () => {
    setPendingFinding(482, "f1");
    expect(takePendingFinding(479)).toBeNull();
    expect(takePendingFinding(482)).toBe("f1");
  });

  it("returns null when nothing was queued", () => {
    expect(takePendingFinding(482)).toBeNull();
  });

  it("a newer queue replaces an unconsumed older one", () => {
    setPendingFinding(482, "f1");
    setPendingFinding(479, "f2");
    expect(takePendingFinding(482)).toBeNull();
    expect(takePendingFinding(479)).toBe("f2");
  });
});

function Probe({ prNumber }: { prNumber: string }) {
  const findingId = useHandoffFinding(prNumber);
  return <span data-testid="out">{findingId ?? "none"}</span>;
}

describe("useHandoffFinding", () => {
  // The regression this exists for: the store is a one-shot and StrictMode runs
  // effects twice in dev, so an unguarded effect claimed the id on pass 1 and
  // then overwrote it with pass 2's null — the deep link died in dev only.
  it("survives StrictMode's double effect invocation", () => {
    setPendingFinding(482, "f1");
    render(
      <StrictMode>
        <Probe prNumber="482" />
      </StrictMode>,
    );
    expect(screen.getByTestId("out")).toHaveTextContent("f1");
  });

  it("yields nothing when the handoff was queued for another PR", () => {
    setPendingFinding(479, "f2");
    render(
      <StrictMode>
        <Probe prNumber="482" />
      </StrictMode>,
    );
    expect(screen.getByTestId("out")).toHaveTextContent("none");
    // still claimable by the PR it was meant for
    expect(takePendingFinding(479)).toBe("f2");
  });

  it("yields nothing when no handoff is queued", () => {
    render(
      <StrictMode>
        <Probe prNumber="482" />
      </StrictMode>,
    );
    expect(screen.getByTestId("out")).toHaveTextContent("none");
  });
});
