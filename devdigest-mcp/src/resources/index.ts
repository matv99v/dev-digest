/**
 * MCP Resources — the reference prose that does **not** belong in `instructions`.
 *
 * The whole token thesis of this server sits in the split between this file and
 * `src/instructions.ts`. `instructions` is billed every turn under
 * `# MCP Server Instructions` and truncated at an unknown threshold, so it holds
 * one sentence. Resources cost **nothing** at session start: the client lists
 * them lazily and fetches a body only when it decides it needs one (through its
 * own `ReadMcpResourceTool`). Every paragraph of explanation therefore lands
 * here, where an agent that needs it can pay for it once and an agent that does
 * not never sees it.
 *
 * Three of them:
 *   devdigest://score-rubric          what a 0–100 score means
 *   devdigest://severity-vocabulary   the severity and category enums
 *   devdigest://blast-radius          get_blast_radius's shape and status vocabulary
 *
 * **No `cacheHint`.** The Phase-0 probe settled the negotiated era at legacy
 * `2025-11-25` (`README.md` § Protocol era), and `ttlMs` / `cacheScope` result
 * caching is a `2026-07-28` construct. `registerResource` still accepts a
 * `cacheHint` on this SDK version; declaring one here would be a no-op that
 * reads as a working cache. Do not add one without re-running the probe.
 */
import type { McpServer } from '@modelcontextprotocol/server';

/**
 * Transcribed verbatim from the `.describe()` on `Review.score` at
 * `server/src/vendor/shared/contracts/findings.ts:75` — the same sentence the
 * model that produced the score was scored against. Paraphrasing it would give
 * an agent a rubric the reviewer never used; if that line changes, change this
 * one with it.
 */
const SCORE_RUBRIC = `# DevDigest score rubric (0–100)

Every review carries one integer \`score\`. This is the rubric the reviewing model
was given, transcribed from the contract that defines it
(\`server/src/vendor/shared/contracts/findings.ts:75\`):

> Overall PR quality from 0 to 100, where HIGHER is better. 90–100 = no or only
> trivial issues (approve); 60–89 = minor suggestions; 30–59 = warnings worth
> addressing; 0–29 = critical problems. Must be consistent with \`findings\`: if
> there are no findings, the score is 90 or above.

**Higher is better.** It is a quality score, not a risk score — a common
misreading, and one that inverts every conclusion drawn from it.

Alongside the score each review carries a \`verdict\`, one of
\`approve\` | \`comment\` | \`request_changes\`. The verdict is the reviewer's
recommendation; the score is its magnitude. Read both: a \`comment\` at 40 and a
\`comment\` at 85 are not the same review.

The score is computed from the **grounded** findings — findings whose citations
were verified against the real diff — not from any figure the model reported
about itself.
`;

/**
 * The two closed enums a caller has to spell correctly. `get_findings`'s
 * `severity` filter takes the first set verbatim (upper case, exactly these
 * three); `category` is not a filter, but it is what a finding's `category`
 * field will contain, so a caller grouping findings knows the whole domain.
 * Both mirror `server/src/vendor/shared/contracts/findings.ts:11` and `:14`.
 */
const SEVERITY_VOCABULARY = `# Severity and category vocabulary

## Severity — \`CRITICAL\` | \`WARNING\` | \`SUGGESTION\`

Exactly three values, always upper case. This is the closed set that
\`get_findings\`'s \`severity\` filter accepts; anything else is rejected rather
than ignored.

- \`CRITICAL\` — a defect that should block the merge: a bug that will fire, a
  security hole, data loss. These are what a review's \`blockers\` count counts.
- \`WARNING\` — a real problem worth addressing, but not one that has to stop the
  merge on its own.
- \`SUGGESTION\` — an improvement. Safe to defer; never a blocker.

## Category — \`bug\` | \`security\` | \`perf\` | \`style\` | \`test\`

Every finding carries exactly one, describing *what kind* of problem it is. It
is orthogonal to severity: a \`style\` finding can be a \`WARNING\`, and a
\`security\` finding can be a \`SUGGESTION\`.

- \`bug\` — incorrect behaviour.
- \`security\` — a vulnerability or an unsafe handling of untrusted input or secrets.
- \`perf\` — a performance or resource-use problem.
- \`style\` — readability, naming, structure, convention.
- \`test\` — missing, wrong or misleading test coverage.

## Confidence

Each finding also carries \`confidence\`, a number from 0 to 1. It is the
reviewer's own certainty, and it is **not** a severity — a high-confidence
\`SUGGESTION\` is still a suggestion, and a low-confidence \`CRITICAL\` is still
worth reading before merging.
`;

/**
 * `get_blast_radius`'s explainer. Its job is to stop a `degraded` or `none`
 * result — or an empty `downstream`/`reverse` on a healthy one — being read as
 * a clean bill of health. Every sentence names what `status` and `reason` mean
 * instead of asserting an all-clear, and none of them says "no impact".
 */
const BLAST_RADIUS = `# get_blast_radius — what it returns, and how to read \`status\`

## What it is

\`get_blast_radius\` calls \`GET /pulls/:id/blast\` on the DevDigest API, which
computes the map on read from the repository's persistent code index — the same
symbols, callers and downstream impact the PR page's BLAST RADIUS card shows.
Zero model calls: the map is pure code-index lookups, never an LLM's guess at
what a change touches.

## Read \`status\` before the map

Every response carries a \`status\`, one of \`indexed\`, \`partial\`, \`degraded\` or
\`none\`. Anything but \`indexed\` carries a \`reason\` naming why:

- \`indexed\` — a full index. The map is as complete as the indexer gets.
- \`partial\` — a working index, but ranking or facts may be incomplete.
- \`degraded\` — running on a fallback path (for example the code-index flag is
  off), or a lookup failed. Callers may all carry \`rank: 0\`.
- \`none\` — the repository has never been indexed. \`changed_symbols\`,
  \`downstream\` and \`reverse\` are empty, and there is nothing to explain.

**An empty or degraded result means the analysis is incomplete, not that the
change is safe.** \`downstream[].endpoints_affected\`, \`downstream[].crons_affected\`
and every \`reverse[].dependents[].endpoints\`/\`.crons\` are *potentially* affected —
found within two hops of the reverse import graph, never confirmed as reached.
Absence from the list is not proof of absence of impact, on any status.

## The shape it returns

The payload matches the wire contract at
\`server/src/vendor/shared/contracts/blast.ts\` (\`PrBlastRadius\`, snake_case, not
the camelCase internal facade):

\`\`\`json
{
  "changed_symbols": [{ "name": "<symbol>", "file": "<path>", "kind": "<kind>" }],
  "downstream": [
    {
      "symbol": "<symbol>",
      "callers": [{ "name": "<symbol>", "file": "<path>", "line": 1 }],
      "endpoints_affected": ["<method> <route>"],
      "crons_affected": ["<job name>"]
    }
  ],
  "summary": "<prose — the status word plus counts, never an all-clear>",
  "status": "indexed | partial | degraded | none",
  "reason": "<why, on every non-'indexed' status>",
  "indexed_sha": "<the sha every caller file:line is pinned to>",
  "callers_truncated": false,
  "reverse": [
    {
      "changed_file": "<path>",
      "dependents": [
        { "file": "<path>", "depth": 1, "via": "<path>", "endpoints": [], "crons": [] }
      ]
    }
  ],
  "explanation": null
}
\`\`\`

\`explanation\` is \`null\` until an Explain has been requested for this PR from the
DevDigest UI — this tool never triggers one itself (\`GET /pulls/:id/blast\` never
calls a model). When present it is a cached, one-paragraph model summary, not a
second source of truth: it describes the same \`downstream\`/\`reverse\` data above.

Callers' \`file:line\`s are pinned to \`indexed_sha\`, not the PR's head sha — the
index can lag behind the head, and a link built from the head sha can land on a
moved or deleted line.
`;

/**
 * Registers the three static resources. Called once by `src/server.ts`.
 *
 * Static URIs, not templates: there is no parameter to vary, and a template
 * would put a URI-construction step between an agent and three fixed documents.
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    'score-rubric',
    'devdigest://score-rubric',
    {
      title: 'DevDigest score rubric (0–100)',
      description:
        'What a review score means: 90–100 approve, 60–89 minor suggestions, 30–59 warnings, 0–29 critical. Higher is better. Read this before interpreting a score or verdict from get_findings.',
      mimeType: 'text/markdown',
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: SCORE_RUBRIC }] }),
  );

  server.registerResource(
    'severity-vocabulary',
    'devdigest://severity-vocabulary',
    {
      title: 'Finding severity and category vocabulary',
      description:
        'The closed enums a finding uses: severity CRITICAL | WARNING | SUGGESTION (the values get_findings filters on) and category bug | security | perf | style | test, plus what confidence means.',
      mimeType: 'text/markdown',
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: SEVERITY_VOCABULARY }],
    }),
  );

  server.registerResource(
    'blast-radius',
    'devdigest://blast-radius',
    {
      title: 'get_blast_radius — the impact map and how to read its status',
      description:
        'What get_blast_radius returns from GET /pulls/:id/blast: the wire shape, and how to read status (indexed/partial/degraded/none) and reason so a degraded or empty map is never mistaken for an all-clear.',
      mimeType: 'text/markdown',
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: BLAST_RADIUS }] }),
  );
}
