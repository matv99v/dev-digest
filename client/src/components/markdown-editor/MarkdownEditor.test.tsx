/**
 * MarkdownEditor — mirrors AgentEditor.test.tsx / AgentCard.test.tsx: mock the
 * data hook directly rather than standing up a QueryClient + network, so the
 * token-count states (heuristic vs. exact) are simple to control per test.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

vi.mock("../../lib/hooks/skills", () => ({
  useCountTokens: vi.fn(() => ({ data: undefined })),
}));

import { useCountTokens } from "../../lib/hooks/skills";
import { MarkdownEditor } from "./MarkdownEditor";
import { heuristicTokens } from "./helpers";

afterEach(cleanup);

const messages = {
  body: {
    unsaved: "Unsaved",
    tokens: "{count} tokens",
  },
};

function renderEditor(props: Partial<React.ComponentProps<typeof MarkdownEditor>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <MarkdownEditor
        value="line one"
        onChange={() => {}}
        filename="pr-quality-rubric.md"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("MarkdownEditor", () => {
  it("shows the filename chip and only shows the unsaved badge when dirty", () => {
    const { rerender } = renderEditor({ dirty: false });
    expect(screen.getByText("pr-quality-rubric.md")).toBeInTheDocument();
    expect(screen.queryByText("Unsaved")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <MarkdownEditor
          value="line one"
          onChange={() => {}}
          filename="pr-quality-rubric.md"
          dirty
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
  });

  it("calls onChange with the new value as the user types", () => {
    const onChange = vi.fn();
    renderEditor({ value: "hello", onChange });

    const textarea = screen.getByDisplayValue("hello");
    fireEvent.change(textarea, { target: { value: "hello world" } });

    expect(onChange).toHaveBeenCalledWith("hello world");
  });

  it("renders the heuristic token count while the debounced fetch hasn't resolved", () => {
    vi.mocked(useCountTokens).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useCountTokens>);
    const value = "some skill body text";
    renderEditor({ value });

    // The debounce hasn't fired yet (or the query has no data either way) —
    // the heuristic estimate must be what's on screen, never a blank/0.
    expect(
      screen.getByText(`${heuristicTokens(value)} tokens`),
    ).toBeInTheDocument();
  });
});
