import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { FindingsPreview } from "./FindingsPreview";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "A live key is committed.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPreview", () => {
  it("opens on hover and lists the findings", () => {
    renderWithIntl(
      <FindingsPreview findings={FINDINGS} onSelect={vi.fn()}>
        <span>trigger</span>
      </FindingsPreview>,
    );
    expect(screen.queryByText("Hardcoded Stripe secret key in commit")).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText("trigger").parentElement!);
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
  });

  it("fires onSelect with the finding id when an entry is clicked", () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <FindingsPreview findings={FINDINGS} onSelect={onSelect}>
        <span>trigger</span>
      </FindingsPreview>,
    );
    fireEvent.mouseEnter(screen.getByText("trigger").parentElement!);
    fireEvent.click(screen.getByText("Hardcoded Stripe secret key in commit"));
    expect(onSelect).toHaveBeenCalledWith("f1");
  });

  it("gives a long file path a title so the truncated text stays readable", () => {
    // A path this long used to widen the panel's content and produce a
    // horizontal scroll that hid the left edge of every line.
    const longPath = "src/modules/reviews/repository/run.repo.ts";
    renderWithIntl(
      <FindingsPreview
        findings={[{ ...FINDINGS[0]!, file: longPath, start_line: 68, end_line: 74 }]}
        onSelect={vi.fn()}
      >
        <span>trigger</span>
      </FindingsPreview>,
    );
    fireEvent.mouseEnter(screen.getByText("trigger").parentElement!);
    expect(screen.getByTitle(`${longPath}:68-74`)).toBeInTheDocument();
  });

  it("shows a loading state instead of entries", () => {
    renderWithIntl(
      <FindingsPreview findings={undefined} loading onSelect={vi.fn()}>
        <span>trigger</span>
      </FindingsPreview>,
    );
    fireEvent.mouseEnter(screen.getByText("trigger").parentElement!);
    expect(screen.getByText("Loading findings…")).toBeInTheDocument();
  });
});
