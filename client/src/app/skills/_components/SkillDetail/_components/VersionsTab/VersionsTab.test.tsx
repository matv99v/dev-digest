/**
 * VersionsTab — mocks lib/hooks/skills directly (mirrors MarkdownEditor.test.tsx),
 * so the newest-is-current / older-gets-actions branching is simple to control.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";

const restoreMutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  restoreMutate.mockClear();
});

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "# v2 body",
  enabled: true,
  version: 2,
  evidence_files: null,
};

const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 2, body: "# v2 body", message: "Tightened the rule", created_at: "2026-02-01T00:00:00.000Z" },
  { skill_id: "sk1", version: 1, body: "# v1 body", message: null, created_at: "2026-01-01T00:00:00.000Z" },
];

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <VersionsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab", () => {
  it("shows the version count and the newest version as Current with no actions", () => {
    renderTab();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    // Only ONE Restore button should exist — for v1, not the current v2.
    expect(screen.getAllByText("Restore")).toHaveLength(1);
  });

  it("older versions show a message (or a dash) and Diff/Restore actions", () => {
    renderTab();
    expect(screen.getByText("Tightened the rule")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument(); // v1's null message
  });

  it("clicking Restore on an older version calls the mutation with that version", () => {
    renderTab();
    fireEvent.click(screen.getByText("Restore"));
    expect(restoreMutate).toHaveBeenCalledWith({ id: "sk1", version: 1 });
  });

  it("opening Diff shows the line-level diff against the CURRENT body", () => {
    renderTab();
    fireEvent.click(screen.getByText("Diff"));
    // v1 body line removed, v2 (current) body line added.
    expect(screen.getByText(/-\s*# v1 body/)).toBeInTheDocument();
    expect(screen.getByText(/\+\s*# v2 body/)).toBeInTheDocument();
  });
});
