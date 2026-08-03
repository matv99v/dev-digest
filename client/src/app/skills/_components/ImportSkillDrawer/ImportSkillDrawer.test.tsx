/**
 * ImportSkillDrawer — mocks the data hooks directly (mirrors
 * MarkdownEditor.test.tsx / AgentEditor.test.tsx) rather than standing up a
 * QueryClient + network, so the preview-vs-confirm states are simple to
 * control per test.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const previewMutate = vi.fn();
const previewReset = vi.fn();
let previewData: unknown;

const createMutate = vi.fn();

vi.mock("../../../../lib/hooks/skills", () => ({
  useImportPreview: () => ({
    mutate: previewMutate,
    data: previewData,
    isPending: false,
    reset: previewReset,
  }),
  useCreateSkill: () => ({
    mutate: createMutate,
    isPending: false,
  }),
}));

import { ImportSkillDrawer } from "./ImportSkillDrawer";
import { ToastProvider } from "../../../../lib/toast";
import messages from "../../../../../messages/en/skills.json";

afterEach(() => {
  cleanup();
  previewData = undefined;
  previewMutate.mockClear();
  previewReset.mockClear();
  createMutate.mockClear();
});

function renderDrawer(onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ImportSkillDrawer onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ImportSkillDrawer", () => {
  it("the paste fallback calls the import-preview endpoint with a synthesized filename + the pasted body", () => {
    renderDrawer();

    fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), {
      target: { value: "My Corner Cases" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Describe the rule/), {
      target: { value: "# My Corner Cases\n\nCheck the edges." },
    });
    fireEvent.click(screen.getByText("Preview"));

    expect(previewMutate).toHaveBeenCalledWith(
      { filename: "my-corner-cases.md", content: "# My Corner Cases\n\nCheck the edges." },
      expect.anything(),
    );
  });

  it("does not call preview when the pasted body is empty", () => {
    renderDrawer();
    fireEvent.click(screen.getByText("Preview"));
    expect(previewMutate).not.toHaveBeenCalled();
  });

  it("renders the parsed preview (name/description/body/warnings) once the preview resolves", () => {
    previewData = {
      name: "corner-case-checklist",
      description: "Checks corner cases.",
      type: "rubric",
      body: "# Corner Case Checklist\n\nCheck the edges.",
      warnings: ["No frontmatter type — defaulted to custom."],
    };
    renderDrawer();

    expect(screen.getByText("corner-case-checklist")).toBeInTheDocument();
    expect(screen.getByText("Checks corner cases.")).toBeInTheDocument();
    expect(screen.getByText("No frontmatter type — defaulted to custom.")).toBeInTheDocument();
  });

  it("creates nothing until the confirm button is explicitly clicked", () => {
    previewData = {
      name: "corner-case-checklist",
      description: "Checks corner cases.",
      type: "rubric",
      body: "# Corner Case Checklist",
      warnings: [],
    };
    renderDrawer();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("confirming saves the skill disabled, with source imported_file", () => {
    previewData = {
      name: "corner-case-checklist",
      description: "Checks corner cases.",
      type: "rubric",
      body: "# Corner Case Checklist",
      warnings: [],
    };
    renderDrawer();

    fireEvent.click(screen.getByText("Save skill"));

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "corner-case-checklist",
        description: "Checks corner cases.",
        type: "rubric",
        body: "# Corner Case Checklist",
        source: "imported_file",
        enabled: false,
      }),
      expect.anything(),
    );
  });

  it('"← Edit" resets the preview instead of confirming', () => {
    previewData = {
      name: "corner-case-checklist",
      description: "Checks corner cases.",
      type: "rubric",
      body: "# Corner Case Checklist",
      warnings: [],
    };
    renderDrawer();

    fireEvent.click(screen.getByText("← Edit"));
    expect(previewReset).toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
  });
});
