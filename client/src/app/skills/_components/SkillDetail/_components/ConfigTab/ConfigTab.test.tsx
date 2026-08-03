/**
 * ConfigTab — mocks lib/hooks/skills and the markdown-editor's own token hook,
 * so the dirty/unsaved and commit-message-on-body-change flows are simple to
 * control without a live QueryClient.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skillsMessages from "../../../../../../../messages/en/skills.json";

const updateMutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false, isSuccess: false, data: undefined }),
  useCountTokens: () => ({ data: undefined }),
}));

vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import { ConfigTab } from "./ConfigTab";
import type { SkillDraft } from "../../constants";

afterEach(() => {
  cleanup();
  updateMutate.mockClear();
});

const SKILL: Skill = {
  id: "sk1",
  name: "no-then-chains",
  description: "Always use async/await.",
  type: "convention",
  source: "manual",
  body: "# No Then Chains",
  enabled: true,
  version: 1,
  evidence_files: null,
};

function renderTab(draft: SkillDraft, dirty: boolean, onDraftChange = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      <ConfigTab skill={SKILL} draft={draft} onDraftChange={onDraftChange} dirty={dirty} />
    </NextIntlClientProvider>,
  );
}

const CLEAN_DRAFT: SkillDraft = {
  name: SKILL.name,
  description: SKILL.description,
  type: SKILL.type,
  body: SKILL.body,
};

describe("ConfigTab", () => {
  it("disables Save when the draft matches the persisted skill (not dirty)", () => {
    renderTab(CLEAN_DRAFT, false);
    expect(screen.getByText("Save skill")).toBeDisabled();
  });

  it("enables Save once the draft differs (dirty)", () => {
    renderTab({ ...CLEAN_DRAFT, name: "renamed" }, true);
    expect(screen.getByText("Save skill")).not.toBeDisabled();
  });

  it("typing a field calls onDraftChange without touching other fields", () => {
    const onDraftChange = vi.fn();
    renderTab(CLEAN_DRAFT, false, onDraftChange);
    fireEvent.change(screen.getByDisplayValue("no-then-chains"), { target: { value: "renamed-skill" } });
    expect(onDraftChange).toHaveBeenCalledWith({ ...CLEAN_DRAFT, name: "renamed-skill" });
  });

  it("saving a metadata-only change (body unchanged) skips the commit-message modal", () => {
    renderTab({ ...CLEAN_DRAFT, name: "renamed-skill" }, true);
    fireEvent.click(screen.getByText("Save skill"));
    expect(screen.queryByText("What changed?")).not.toBeInTheDocument();
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sk1",
        patch: expect.objectContaining({ name: "renamed-skill", body: SKILL.body }),
      }),
      expect.anything(),
    );
  });

  it("saving a body change opens the commit-message modal and does NOT save until confirmed", () => {
    renderTab({ ...CLEAN_DRAFT, body: "# New body" }, true);
    fireEvent.click(screen.getByText("Save skill"));
    expect(screen.getByText("What changed?")).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("confirming the commit-message modal saves with the typed message", () => {
    renderTab({ ...CLEAN_DRAFT, body: "# New body" }, true);
    fireEvent.click(screen.getByText("Save skill"));
    fireEvent.change(screen.getByPlaceholderText(/Tightened the scope rule/), {
      target: { value: "Reworded the rule" },
    });
    fireEvent.click(screen.getByText("Save version"));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sk1",
        patch: expect.objectContaining({ body: "# New body", message: "Reworded the rule" }),
      }),
      expect.anything(),
    );
  });
});
