import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentDetail } from "@/lib/types";
import messages from "@/../messages/en/intent.json";

// `IntentCard.tsx` imports `useIntent`/`useDeriveIntent` from the `@/lib/hooks`
// barrel, six levels under src/app — path computed with
// `node -e "console.log(require('path').relative(...))"`, not counted by eye
// (client/INSIGHTS.md, 2026-09-01).
const { mockUseIntent, mockUseDeriveIntent } = vi.hoisted(() => ({
  mockUseIntent: vi.fn(),
  mockUseDeriveIntent: vi.fn(),
}));

vi.mock("../../../../../../../lib/hooks", () => ({
  useIntent: mockUseIntent,
  useDeriveIntent: mockUseDeriveIntent,
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const BASE_DETAIL: PrIntentDetail = {
  pr_id: "pr1",
  intent: "Adds a PR Intent Layer so a review can see what the PR set out to do.",
  in_scope: ["intent derivation", "prompt assembly"],
  out_of_scope: ["UI redesign of the Overview tab"],
  confidence: "medium",
  sources: [{ kind: "pr_body", ref: null }],
  derived_from_sha: "abc1234",
  derived_at: "2026-09-01T00:00:00.000Z",
  model: "gpt-4.1",
  provider: "openai",
  stale: false,
};

describe("IntentCard", () => {
  it("renders the empty state with a working derive action when no intent has been derived yet", () => {
    const mutate = vi.fn();
    mockUseIntent.mockReturnValue({ data: null, isLoading: false, isError: false, refetch: vi.fn() });
    mockUseDeriveIntent.mockReturnValue({ mutate, isPending: false });

    renderWithIntl(<IntentCard prId="pr1" />);

    expect(screen.getByText("Intent not derived yet")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Derive PR intent" });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("renders the confidence badge as text, not colour alone, for a low-confidence intent", () => {
    mockUseIntent.mockReturnValue({
      data: { ...BASE_DETAIL, confidence: "low" },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseDeriveIntent.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderWithIntl(<IntentCard prId="pr1" />);

    expect(screen.getByText("Low confidence")).toBeInTheDocument();
  });

  it("shows a stale marker only when the response reports the intent as stale", () => {
    mockUseDeriveIntent.mockReturnValue({ mutate: vi.fn(), isPending: false });

    mockUseIntent.mockReturnValue({
      data: { ...BASE_DETAIL, stale: true },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { unmount } = renderWithIntl(<IntentCard prId="pr1" />);
    expect(screen.getByText("Stale — head has moved since this was derived")).toBeInTheDocument();
    unmount();

    mockUseIntent.mockReturnValue({
      data: { ...BASE_DETAIL, stale: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithIntl(<IntentCard prId="pr1" />);
    expect(
      screen.queryByText("Stale — head has moved since this was derived"),
    ).not.toBeInTheDocument();
  });
});
