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
 *   devdigest://blast-radius          what the get_blast_radius stub is for
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
 * The stub's explainer. Its job is to stop an empty result being read as a
 * clean bill of health — the one failure mode a stub that returns empty arrays
 * has. Every sentence here says *not implemented*, and none of them says
 * "no impact".
 */
const BLAST_RADIUS = `# get_blast_radius — what it is, and what it is not yet

## Not implemented

\`get_blast_radius\` is registered but **not implemented**. It returns its wire
shape with empty arrays and a summary saying so.

An empty result from this tool means *the analysis did not run*. It does **not**
mean the change is contained, and it is not evidence of anything about the code.
Until this is implemented, establish impact by reading the diff and searching for
callers directly.

## The shape it returns, today and later

The payload matches the wire contract at
\`server/src/vendor/shared/contracts/brief.ts\` (snake_case, not the camelCase
internal facade):

\`\`\`json
{
  "changed_symbols": ["<symbol>"],
  "downstream": [
    {
      "symbol": "<symbol>",
      "callers": ["<file:line>"],
      "endpoints_affected": ["<method> <route>"],
      "crons_affected": ["<job name>"]
    }
  ],
  "summary": "<prose>"
}
\`\`\`

The stub returns \`changed_symbols: []\`, \`downstream: []\` and a \`summary\` that
states it is not implemented. The shape is fixed now on purpose: when the real
analysis lands it is a mapper plus a route on the API, not a contract change, so
nothing that already calls this tool has to change with it.

## What it will do once implemented

Given a repo and a list of changed files, it will name the symbols those files
export, then walk the repo's code index to report, for each one, the callers that
reach it, the HTTP endpoints that depend on it, and the scheduled jobs that do.
That index is served by the API's \`repo-intel\` module, which does not yet expose
a route for this query.
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
      title: 'get_blast_radius — not implemented, and what it will return',
      description:
        'Why get_blast_radius returns empty arrays today: the analysis is not implemented. Its wire shape, and what it will report once it is. An empty result is not a finding of no impact.',
      mimeType: 'text/markdown',
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: BLAST_RADIUS }] }),
  );
}
