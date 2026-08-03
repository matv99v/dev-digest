/**
 * SkillsListColumn — mocks lib/hooks/skills + next/navigation + the (already
 * separately-tested) ImportSkillDrawer, so this file only exercises the list
 * rendering, filtering, and dropdown wiring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const createMutate = vi.fn();
const updateMutate = vi.fn();

vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));

vi.mock("../ImportSkillDrawer", () => ({
  ImportSkillDrawer: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="import-drawer">
      <button onClick={onClose}>close-drawer</button>
    </div>
  ),
}));

import { SkillsListColumn } from "./SkillsListColumn";

afterEach(() => {
  cleanup();
  push.mockClear();
  createMutate.mockClear();
  updateMutate.mockClear();
});

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "pr-quality-rubric",
    description: "Rubric for PR quality.",
    type: "rubric",
    source: "manual",
    body: "# Rubric",
    enabled: true,
    version: 1,
    evidence_files: null,
  },
  {
    id: "sk2",
    name: "secret-leakage-gate",
    description: "Flags hardcoded secrets.",
    type: "security",
    source: "community",
    body: "# Secrets",
    enabled: false,
    version: 1,
    evidence_files: null,
  },
];

function renderColumn(selectedId: string | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsListColumn selectedId={selectedId} />
    </NextIntlClientProvider>,
  );
}

describe("SkillsListColumn", () => {
  it("renders every skill", () => {
    renderColumn();
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
  });

  it("filtering by name hides non-matching cards without any network call", () => {
    renderColumn();
    fireEvent.change(screen.getByPlaceholderText("Search skills…"), {
      target: { value: "secret" },
    });
    expect(screen.queryByText("pr-quality-rubric")).not.toBeInTheDocument();
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("clicking a card navigates to its Config tab", () => {
    renderColumn();
    fireEvent.click(screen.getByText("pr-quality-rubric"));
    expect(push).toHaveBeenCalledWith("/skills/sk1?tab=config");
  });

  it('"Create from scratch" creates a default skill and navigates to it', () => {
    createMutate.mockImplementation((_input, opts) => opts.onSuccess({ id: "new-id" }));
    renderColumn();
    fireEvent.click(screen.getByText("Add Skill"));
    fireEvent.click(screen.getByText("Create from scratch"));
    expect(createMutate).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/skills/new-id?tab=config");
  });

  it('"Import from file" opens the ImportSkillDrawer', () => {
    renderColumn();
    fireEvent.click(screen.getByText("Add Skill"));
    fireEvent.click(screen.getByText("Import from file"));
    expect(screen.getByTestId("import-drawer")).toBeInTheDocument();
  });
});
