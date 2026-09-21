import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBlastRadius } from "@/lib/types";
import messages from "@/../messages/en/blast.json";

// Relative mock paths are computed, never counted by eye — this component sits
// seven levels under `src` and a wrong count fails *silently*: the component
// calls the real hook (client/INSIGHTS.md, 2026-09-01).
//   node -e "console.log(require('path').relative(
//     require('path').dirname('src/app/repos/[repoId]/pulls/[number]/_components/BlastCard/BlastCard.test.tsx'),
//     'src/lib/hooks'))"  →  ../../../../../../../lib/hooks
const { mockUseBlast, mockUseExplainBlast, mockUseResync, mockUseActiveRepo, mermaidCharts } =
  vi.hoisted(() => ({
    mockUseBlast: vi.fn(),
    mockUseExplainBlast: vi.fn(),
    mockUseResync: vi.fn(),
    mockUseActiveRepo: vi.fn(),
    mermaidCharts: [] as string[],
  }));

vi.mock("../../../../../../../lib/hooks", () => ({
  useBlast: mockUseBlast,
  useExplainBlast: mockUseExplainBlast,
  useResyncRepoIntel: mockUseResync,
}));

// `useActiveRepo` lives in `@/lib/repo-context`, not in the hooks barrel.
vi.mock("../../../../../../../lib/repo-context", () => ({
  useActiveRepo: mockUseActiveRepo,
}));

// mermaid renders by measuring the DOM and jsdom implements no SVG layout, so
// an unmocked render is a slow no-op that would make the graph case pass for
// the wrong reason. Capture the source instead — that string is what R16
// asserts against.
vi.mock("../../../../../../../components/mermaid-diagram/MermaidDiagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => {
    mermaidCharts.push(chart);
    return <pre data-testid="mermaid-chart">{chart}</pre>;
  },
}));

import { BlastCard } from "./BlastCard";
import { buildFlowchart, escapeMermaidLabel } from "./helpers";

/** The index is behind the PR head, so the two shas differ — a fixture that
    gives them the same value hides a head-sha link bug completely. */
const INDEXED_SHA = "1dexed11111111111111111111111111111dexed";
const HEAD_SHA = "head99999999999999999999999999999999head";

const BASE: PrBlastRadius = {
  changed_symbols: [
    { name: "IdParams", file: "server/src/modules/_shared/schemas.ts", kind: "const" },
    { name: "PageQuery", file: "server/src/modules/_shared/schemas.ts", kind: "const" },
  ],
  downstream: [
    {
      symbol: "IdParams",
      callers: [
        { name: "IdParams", file: "server/src/modules/reviews/routes.ts", line: 42 },
        { name: "IdParams", file: "server/src/modules/repos/routes.ts", line: 17 },
      ],
      endpoints_affected: ["GET /pulls/:id/review"],
      crons_affected: ["poll-prs"],
    },
    {
      symbol: "PageQuery",
      callers: [{ name: "PageQuery", file: "server/src/modules/repos/routes.ts", line: 63 }],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: "2 changed symbols, 3 resolved callers, 1 potentially affected endpoint (indexed).",
  status: "indexed",
  reason: null,
  indexed_sha: INDEXED_SHA,
  callers_truncated: false,
  reverse: [
    {
      changed_file: "server/src/modules/_shared/schemas.ts",
      dependents: [
        {
          file: "server/src/modules/reviews/routes.ts",
          depth: 1,
          via: "server/src/modules/_shared/schemas.ts",
          endpoints: ["GET /pulls/:id/review"],
          crons: [],
        },
        {
          file: "server/src/app.ts",
          depth: 2,
          via: "server/src/modules/reviews/routes.ts",
          endpoints: [],
          crons: [],
        },
      ],
    },
  ],
  explanation: null,
};

function renderCard(data: PrBlastRadius) {
  mockUseBlast.mockReturnValue({ data, isLoading: false, isError: false, refetch: vi.fn() });
  mockUseExplainBlast.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockUseResync.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockUseActiveRepo.mockReturnValue({
    repoId: "repo1",
    activeRepo: { id: "repo1", full_name: "acme/dev-digest", default_branch: "main" },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastCard prId="pr1" />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mermaidCharts.length = 0;
  vi.clearAllMocks();
});

describe("BlastCard", () => {
  it("renders the tree by default", () => {
    renderCard(BASE);

    expect(screen.getByText("server/src/modules/reviews/routes.ts:42")).toBeInTheDocument();
    expect(screen.queryByTestId("mermaid-chart")).not.toBeInTheDocument();
  });

  it("toggling to graph renders the mermaid diagram and back restores the tree", () => {
    renderCard(BASE);

    fireEvent.click(screen.getByRole("button", { name: /graph/i }));
    expect(screen.getByTestId("mermaid-chart")).toBeInTheDocument();
    expect(screen.queryByText("server/src/modules/reviews/routes.ts:42")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /tree/i }));
    expect(screen.queryByTestId("mermaid-chart")).not.toBeInTheDocument();
    expect(screen.getByText("server/src/modules/reviews/routes.ts:42")).toBeInTheDocument();
  });

  it("status partial renders a badge whose text names the reason", () => {
    renderCard({
      ...BASE,
      status: "partial",
      reason: "the index is incomplete — file ranks may be missing",
    });

    expect(
      screen.getByText("Partial index — the index is incomplete — file ranks may be missing"),
    ).toBeInTheDocument();
  });

  it("status degraded renders a badge with an icon and text", () => {
    renderCard({
      ...BASE,
      status: "degraded",
      reason: "repoIntelEnabled is off, so caller ranks are all zero",
    });

    const badge = screen.getByText(
      "Degraded index — repoIntelEnabled is off, so caller ranks are all zero",
    );
    // Icon + colour + text together — never colour alone.
    expect(badge.querySelector("svg")).not.toBeNull();
  });

  it("status none renders the empty state and no tree", () => {
    renderCard({
      ...BASE,
      status: "none",
      reason: "this repository has never been indexed",
      indexed_sha: null,
    });

    expect(screen.getByText("This repository has no code index")).toBeInTheDocument();
    expect(screen.queryByText("server/src/modules/reviews/routes.ts:42")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze repository/i })).toBeInTheDocument();
  });

  it("a caller's link href carries indexed_sha and #L<line>", () => {
    renderCard(BASE);

    const link = screen.getByText("server/src/modules/reviews/routes.ts:42");
    expect(link).toHaveAttribute(
      "href",
      `https://github.com/acme/dev-digest/blob/${INDEXED_SHA}/server/src/modules/reviews/routes.ts#L42`,
    );
  });

  it("the link href does not contain the PR head sha", () => {
    renderCard(BASE);

    for (const link of document.querySelectorAll("a[href]")) {
      expect(link.getAttribute("href")).not.toContain(HEAD_SHA);
      expect(link.getAttribute("href")).toContain(INDEXED_SHA);
    }
  });

  it("the endpoints heading uses the potentiallyAffected string", () => {
    renderCard(BASE);

    expect(screen.getByText("Potentially affected endpoints")).toBeInTheDocument();
  });

  it("expanding a second symbol does not remount the first", () => {
    renderCard(BASE);

    const before = screen.getByText("server/src/modules/reviews/routes.ts:42");
    fireEvent.click(screen.getByRole("button", { name: /PageQuery/ }));

    // Node identity, not presence: a presence assertion passes across a
    // remount and proves nothing (client/INSIGHTS.md, 2026-09-06).
    expect(screen.getByText("server/src/modules/reviews/routes.ts:42")).toBe(before);
    expect(screen.getByText("server/src/modules/repos/routes.ts:63")).toBeInTheDocument();
  });
});

describe("escapeMermaidLabel", () => {
  it("escapes # before \", yielding #35; and #quot; and never #35;quot;", () => {
    expect(escapeMermaidLabel('a#b"c')).toBe("a#35;b#quot;c");
    expect(escapeMermaidLabel('a#b"c')).not.toContain("#35;quot;");
  });

  it("emits a single-line label for a label containing a newline", () => {
    const label = escapeMermaidLabel('src/we\nird.ts");\nclick n0 href "javascript:alert(1)"');

    expect(label).not.toContain("\n");
    expect(label.split("\n")).toHaveLength(1);
  });

  it("keeps a %%{init: label from starting a directive line", () => {
    const chart = buildFlowchart(
      {
        changed_symbols: [
          {
            name: "%%{init: {'themeVariables': {'primaryColor': 'red'}} }%%",
            file: "src/a.ts",
            kind: "const",
          },
        ],
        downstream: [],
        reverse: [],
      },
      "acme/dev-digest",
      INDEXED_SHA,
    );

    for (const line of chart.split("\n")) {
      expect(line.trimStart().startsWith("%%{")).toBe(false);
    }
  });
});

describe("buildFlowchart", () => {
  it("gives every caller node a click href line carrying indexed_sha", () => {
    const chart = buildFlowchart(BASE, "acme/dev-digest", INDEXED_SHA);
    const clicks = chart.split("\n").filter((l) => l.trimStart().startsWith("click "));

    expect(clicks.length).toBeGreaterThanOrEqual(3);
    expect(clicks).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          `https://github.com/acme/dev-digest/blob/${INDEXED_SHA}/server/src/modules/reviews/routes.ts#L42`,
        ),
      ]),
    );
    for (const click of clicks) expect(click).toContain(INDEXED_SHA);
  });

  it("emits no click href line containing the PR head sha", () => {
    const chart = buildFlowchart(BASE, "acme/dev-digest", INDEXED_SHA);

    expect(chart).not.toContain(HEAD_SHA);
  });

  it("produces source mermaid.parse accepts for labels containing a quote and a hash", async () => {
    // `flow.jison` matches `<string>[^"]+` with no backslash escape, so one
    // unescaped quote breaks the whole diagram — and `MermaidDiagram` renders
    // `null` for a parse failure, i.e. a blank box, never an error. Confirmed
    // to reject when the label is interpolated unescaped.
    const chart = buildFlowchart(
      {
        changed_symbols: [{ name: 'we"ird#name', file: 'src/a"b#c.ts', kind: "const" }],
        downstream: [
          {
            symbol: 'we"ird#name',
            callers: [{ name: "x", file: 'src/c"d.ts', line: 3 }],
            endpoints_affected: [],
            crons_affected: [],
          },
        ],
        reverse: [],
      },
      "acme/dev-digest",
      INDEXED_SHA,
    );

    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", htmlLabels: false });
    await expect(mermaid.parse(chart)).resolves.toBeTruthy();
  }, 30000);

  it("returns an empty string when there is nothing to draw", () => {
    expect(
      buildFlowchart({ changed_symbols: [], downstream: [], reverse: [] }, "acme/dev-digest", INDEXED_SHA),
    ).toBe("");
  });
});
