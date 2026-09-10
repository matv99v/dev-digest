import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "@/../messages/en/runs.json";

// TraceBody takes `trace`/`findings` as plain props (no hooks of its own), so
// no `vi.mock` is needed here — render it directly.
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** A `prompt_assembly` with `intent` genuinely omitted from the object literal
    (not set to `undefined`) — simulating a trace persisted before the field
    existed, per the `.nullish()` contract at contracts/trace.ts. */
const PROMPT_ASSEMBLY_NO_INTENT_KEY = {
  system: "You are a reviewer.",
  skills: null,
  memory: null,
  specs: null,
  callers: null,
  repo_map: null,
  pr_description: null,
  user: "Review PR #482",
} as const;

function buildTrace(promptAssembly: RunTrace["prompt_assembly"]): RunTrace {
  return {
    config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
    stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, findings: 0, grounding: "2/2 passed" },
    prompt_assembly: promptAssembly,
    tool_calls: [],
    raw_output: "",
    memory_pulled: [],
    specs_read: [],
    log: [],
  };
}

function openPromptAssembly() {
  fireEvent.click(screen.getByText("Prompt assembly"));
}

describe("TraceBody — Intent row in the Prompt assembly panel", () => {
  it("renders an Intent block when prompt_assembly.intent is a non-empty string", () => {
    const trace = buildTrace({ ...PROMPT_ASSEMBLY_NO_INTENT_KEY, intent: "Add a PR Intent Layer." });
    renderWithIntl(<TraceBody trace={trace} findings={[]} />);

    openPromptAssembly();

    expect(screen.getByText("Intent (derived, dynamic)")).toBeInTheDocument();
  });

  it("renders no Intent block, without crashing, when prompt_assembly.intent is explicitly null", () => {
    const trace = buildTrace({ ...PROMPT_ASSEMBLY_NO_INTENT_KEY, intent: null });
    renderWithIntl(<TraceBody trace={trace} findings={[]} />);

    openPromptAssembly();

    expect(screen.queryByText("Intent (derived, dynamic)")).not.toBeInTheDocument();
    // The rest of the panel still rendered — no crash.
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("User / diff (dynamic)")).toBeInTheDocument();
  });

  it("renders no Intent block, without crashing, when the intent key is absent entirely (an old persisted trace)", () => {
    const trace = buildTrace(PROMPT_ASSEMBLY_NO_INTENT_KEY);
    expect("intent" in trace.prompt_assembly).toBe(false);

    renderWithIntl(<TraceBody trace={trace} findings={[]} />);

    openPromptAssembly();

    expect(screen.queryByText("Intent (derived, dynamic)")).not.toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("User / diff (dynamic)")).toBeInTheDocument();
  });
});
