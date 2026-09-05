import path from 'node:path';
import { z } from 'zod';
import type { IntentConfidence, IntentSource, IntentSourceKind, PrIntentDetail } from '@devdigest/shared';
import type { PullRow } from '../../db/rows.js';
import {
  DOC_ROOTS,
  INLINE_PLAN_MIN_HEADINGS,
  MAX_SCOPE_ITEM_CHARS,
  MAX_SCOPE_ITEMS,
} from './constants.js';

/**
 * Pure helpers for the PR Intent Layer — zero I/O, the tested surface (per
 * onion-architecture). Mirrors `modules/conventions/helpers.ts`'s split: the
 * raw model-output schema, verify/ground-in-code gates, and row⇄DTO mapping
 * all live here so they're unit-testable without a DB/LLM/filesystem.
 */

// ---------------------------------------------------------------------------
// Raw model output — internal to this module, never a shared contract. Flat,
// three required fields, no optionals/unions/nesting, no array-length bounds
// (caps are applied in code via dropUngroundedScope / MAX_INTENT_CHARS).
// Dictated by OpenAI strict structured output (`additionalProperties:false` +
// everything `required`) and by OpenRouter, where an unsupported schema shape
// ERRORS rather than degrading — see the plan's Risks table.
//
// Deliberately NO confidence field: the model is never asked to self-report
// one. `computeConfidence` below is a pure function of the evidence actually
// gathered, never of model output (R4).
// ---------------------------------------------------------------------------

export const RawIntent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type RawIntent = z.infer<typeof RawIntent>;

// ---------------------------------------------------------------------------
// Row ⇄ DTO mapping
// ---------------------------------------------------------------------------

/** The raw `pr_intent` row shape this module reads/writes — kept structural
 *  (not imported from the repository) so this file stays free of any
 *  repository/db import, per the pure-layer import rule. */
export interface IntentRow {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: string;
  sources: IntentSource[];
  derivedFromSha: string;
  derivedAt: Date;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

/**
 * An intent is fresh iff it was derived at the PR's current head sha AND
 * no later than the PR's own `updatedAt` (R3). Both halves matter
 * independently:
 *   - the sha half catches a new push;
 *   - the `updatedAt` half catches the author rewriting the description
 *     WITHOUT moving the head (a sha-only check would serve that stale
 *     narrative forever).
 * `updatedAt` is nullable (`pulls.ts`) — a null must read as FRESH, not
 * stale, so a seeded/imported PR with no `updated_at` doesn't re-derive on
 * every single run.
 */
export function isIntentFresh(
  row: Pick<IntentRow, 'derivedFromSha' | 'derivedAt'>,
  pull: Pick<PullRow, 'headSha' | 'updatedAt'>,
): boolean {
  if (row.derivedFromSha !== pull.headSha) return false;
  const updatedAt = pull.updatedAt ?? row.derivedAt;
  return row.derivedAt.getTime() >= updatedAt.getTime();
}

/** Map a persisted `pr_intent` row + its parent PR to the wire `PrIntentDetail`. */
export function toIntentDetail(row: IntentRow, pull: Pick<PullRow, 'headSha' | 'updatedAt'>): PrIntentDetail {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence as IntentConfidence,
    sources: row.sources,
    derived_from_sha: row.derivedFromSha,
    derived_at: row.derivedAt.toISOString(),
    model: row.model,
    provider: row.provider,
    stale: !isIntentFresh(row, pull),
  };
}

// ---------------------------------------------------------------------------
// Document link resolution — the security gate (Risks: path traversal via a
// PR-body link). The PR body is fully attacker-controlled and its links drive
// filesystem reads through `container.git.readFile`, so every candidate is
// validated here, as a pure string check, BEFORE any I/O is attempted.
// ---------------------------------------------------------------------------

/**
 * Validate + normalize a candidate in-repo doc link extracted from a PR/issue
 * body. Returns the normalized, repo-relative path to read, or `null` when
 * the candidate is rejected. Rejects, in order:
 *   1. empty / NUL-byte-carrying input
 *   2. any URL scheme (`https://…`, `mailto:…`, …) — no external HTTP, ever
 *   3. an absolute path (`/etc/passwd`)
 *   4. anything whose `path.posix.normalize` result starts with `..` or
 *      contains a `..` segment (traversal, including one that only
 *      surfaces after normalization)
 *   5. any extension but `.md`
 *   6. any first path segment outside `DOC_ROOTS`, UNLESS the candidate has
 *      no directory component at all (a root-level `*.md` file, e.g. `README.md`)
 * A trailing `#anchor` (markdown heading link) is stripped before any of the
 * above — `README.md#anchor` resolves to `README.md`.
 */
export function resolveRepoDocPath(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (raw.includes('\0')) return null;

  const hashIdx = raw.indexOf('#');
  const withoutFragment = (hashIdx >= 0 ? raw.slice(0, hashIdx) : raw).trim();
  if (withoutFragment.length === 0) return null;

  // Any URL scheme (http:, https:, mailto:, ftp:, …) — reject before any
  // path-shaped processing. Deliberately generic rather than an allowlist of
  // known schemes, since the requirement is "no URL scheme", not "no
  // http(s)".
  if (/^[a-z][a-z0-9+.-]*:/i.test(withoutFragment)) return null;

  if (path.posix.isAbsolute(withoutFragment)) return null;

  const normalized = path.posix.normalize(withoutFragment);
  if (normalized === '..' || normalized.startsWith('../') || normalized.split('/').includes('..')) {
    return null;
  }

  if (!normalized.toLowerCase().endsWith('.md')) return null;

  const segments = normalized.split('/');
  const isRootLevelMd = segments.length === 1;
  const inAllowedRoot = DOC_ROOTS.some((root) => normalized.startsWith(root));
  if (!isRootLevelMd && !inAllowedRoot) return null;

  return normalized;
}

const MARKDOWN_LINK_RE = /]\(([^)\s]+)\)/g;
const BARE_DOC_LINK_RE = /(?:^|[\s(])((?:[\w.-]+\/)*[\w.-]+\.md)(?=[\s).,;:!?]|$)/gim;

/**
 * Extract candidate doc-link strings from free text (a PR body or a linked
 * issue's body) — markdown inline links `[text](path)` plus bare
 * `some/path.md`-shaped mentions. Returned strings are RAW candidates, not
 * yet validated; every one must still go through `resolveRepoDocPath` before
 * any filesystem read.
 */
export function extractDocLinks(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined) => {
    const target = raw?.trim();
    if (target && !seen.has(target)) {
      seen.add(target);
      found.push(target);
    }
  };
  for (const m of text.matchAll(MARKDOWN_LINK_RE)) add(m[1]);
  for (const m of text.matchAll(BARE_DOC_LINK_RE)) add(m[1]);
  return found;
}

// ---------------------------------------------------------------------------
// Closing-issue extraction — a NEW, stricter extractor than
// `adapters/github/octokit.ts`'s `resolveLinkedIssue`, whose keyword group is
// OPTIONAL (`/(?:closes|fixes|resolves)?\s*#(\d+)/i`), so "see #4321 for
// context" resolves #4321 as THE linked issue there. Grounding an intent on
// that at `high` confidence is exactly the failure this feature must not
// have, so this module requires a documented closing keyword immediately
// before `#N` / `owner/repo#N`. The adapter itself is left untouched — it
// feeds `PrDetail.linked_issue`, a different, looser concern.
// ---------------------------------------------------------------------------

const CLOSING_ISSUE_RE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)\b/i;

/** Documented-closing-keyword-only issue extraction. `null` when no such
 *  reference is present — including "see #4321", which the adapter's looser
 *  regex would resolve but this one deliberately does not. */
export function extractClosingIssueNumber(body: string): number | null {
  const m = body.match(CLOSING_ISSUE_RE);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Inline plan/spec detection (R12) — a plan/spec pasted whole into a PR or
// linked-issue body, as opposed to linked (covered by extractDocLinks +
// resolveRepoDocPath).
// ---------------------------------------------------------------------------

/** This repo's own spec template headings (`specs/README.md`). */
const SPEC_TEMPLATE_HEADINGS: readonly string[] = [
  'Goal',
  'Scope',
  'Out of scope',
  'Design',
  'Files touched',
  'Verification',
];

/** This repo's own plan template headings (`docs/plans/README.md`). */
const PLAN_TEMPLATE_HEADINGS: readonly string[] = [
  'Requirements',
  'Architecture',
  'Phased tasks',
  'Lanes',
  'Testing',
  'Dependency',
];

export interface InlinePlanDetection {
  kind: 'plan' | 'spec' | null;
  headings: string[];
}

function extractAtxHeadings(text: string): string[] {
  const headings: string[] = [];
  for (const m of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const h = m[1]?.trim();
    if (h) headings.push(h);
  }
  return headings;
}

function normalizeHeading(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ').replace(/:$/, '');
}

/** A heading matches a template entry on an exact match, or the heading
 *  starting with the template text followed by a space (so "Dependency
 *  graph" matches the template entry "Dependency"). */
function headingMatchesTemplate(heading: string, template: string): boolean {
  const h = normalizeHeading(heading);
  const t = normalizeHeading(template);
  return h === t || h.startsWith(`${t} `);
}

function matchedTemplateHeadings(headings: string[], template: readonly string[]): string[] {
  return template.filter((t) => headings.some((h) => headingMatchesTemplate(h, t)));
}

/**
 * Detect whether `text` carries the structure of this repo's own plan or
 * spec template — a plan/spec reaches a reviewer either LINKED (covered by
 * `extractDocLinks` + `resolveRepoDocPath`) or PASTED WHOLE into the body;
 * this covers the paste. Counts DISTINCT ATX headings matching one of the
 * two template sets, case-insensitively, on the heading text only (never on
 * body prose). Threshold `INLINE_PLAN_MIN_HEADINGS` (3): two is reachable by
 * an ordinary well-written PR description ("Goal" + "Scope" is a common
 * template pair); three is not.
 */
export function detectInlinePlan(text: string): InlinePlanDetection {
  const headings = extractAtxHeadings(text);
  const specMatched = matchedTemplateHeadings(headings, SPEC_TEMPLATE_HEADINGS);
  const planMatched = matchedTemplateHeadings(headings, PLAN_TEMPLATE_HEADINGS);

  if (specMatched.length >= INLINE_PLAN_MIN_HEADINGS && specMatched.length >= planMatched.length) {
    return { kind: 'spec', headings: specMatched };
  }
  if (planMatched.length >= INLINE_PLAN_MIN_HEADINGS) {
    return { kind: 'plan', headings: planMatched };
  }
  return { kind: null, headings: [] };
}

// ---------------------------------------------------------------------------
// Body prose measurement — feeds `computeConfidence`'s `medium` tier. Strips
// the noise an untouched PR template is made of (HTML comments, checkbox
// lines, horizontal rules) before measuring length, so an empty template
// doesn't read as "the author wrote something".
// ---------------------------------------------------------------------------

export function stripBodyNoise(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => !/^\s*[-*]\s*\[[ xX]\]/.test(line))
    .filter((line) => !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line))
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Indirect baseline signals — title/branch/commits/changed paths. Always
// gathered so a PR with no real documentation still yields SOME intent
// (marked `low` confidence rather than being absent).
// ---------------------------------------------------------------------------

export interface IndirectSignalInput {
  title: string;
  branch: string;
  commits: readonly { message: string }[];
  changedPaths: readonly string[];
}

export interface IndirectSignals {
  /** One `IntentSource` per non-empty signal actually present. */
  sources: IntentSource[];
  /** Rendered text for the derivation prompt; empty string when nothing
   *  was present at all (never expected in practice — every PR has a title). */
  text: string;
}

/** Cap on how many commit messages / changed paths are rendered into the
 *  prompt text — a private safety valve, not a plan-listed constant, since
 *  this is pure prompt formatting rather than a persisted/verified cap. */
const MAX_INDIRECT_LIST_ITEMS = 20;

export function buildIndirectSignals(input: IndirectSignalInput): IndirectSignals {
  const sources: IntentSource[] = [];
  const sections: string[] = [];

  const title = input.title.trim();
  if (title) {
    sources.push({ kind: 'title', ref: null });
    sections.push(`Title: ${title}`);
  }

  const branch = input.branch.trim();
  if (branch) {
    sources.push({ kind: 'branch', ref: null });
    sections.push(`Branch: ${branch}`);
  }

  if (input.commits.length > 0) {
    sources.push({ kind: 'commits', ref: null });
    const messages = input.commits
      .slice(0, MAX_INDIRECT_LIST_ITEMS)
      .map((c) => `- ${c.message.split('\n')[0]}`);
    sections.push(`Commit messages:\n${messages.join('\n')}`);
  }

  if (input.changedPaths.length > 0) {
    sources.push({ kind: 'changed_paths', ref: null });
    const pathsList = input.changedPaths
      .slice(0, MAX_INDIRECT_LIST_ITEMS)
      .map((p) => `- ${p}`);
    sections.push(`Changed paths:\n${pathsList.join('\n')}`);
  }

  return { sources, text: sections.join('\n\n') };
}

// ---------------------------------------------------------------------------
// Scope grounding (R5) — the L02 verify-then-keep gate applied here: a scope
// entry that names a repo path is kept only if it's grounded in the PR's
// actual changed files; free-form prose passes through unconditionally.
// ---------------------------------------------------------------------------

/** True when `item` reads as a repo path (no whitespace, and either a `/`
 *  or a file-extension-shaped suffix) rather than free-form prose. Prose
 *  almost always contains a space; a real path essentially never does. */
function looksLikePath(item: string): boolean {
  if (item.length === 0 || /\s/.test(item)) return false;
  return item.includes('/') || /\.[A-Za-z0-9]{1,10}$/.test(item);
}

/** `item` is grounded in `changedPaths` when it equals one, is a directory
 *  prefix of one, or one of them is a prefix of it — any of the three is
 *  "this path is part of what the PR actually touched". */
function isGrounded(item: string, changedPaths: readonly string[]): boolean {
  return changedPaths.some((cp) => cp === item || cp.startsWith(item) || item.startsWith(cp));
}

/**
 * Drop scope entries that name a repo path not present in the PR's changed
 * files; keep free-form prose entries unconditionally. Caps the result at
 * `MAX_SCOPE_ITEMS`, each truncated to `MAX_SCOPE_ITEM_CHARS` — the two caps
 * this module applies in code rather than trusting the model's array length.
 */
export function dropUngroundedScope(items: readonly string[], changedPaths: readonly string[]): string[] {
  const kept: string[] = [];
  for (const raw of items) {
    if (kept.length >= MAX_SCOPE_ITEMS) break;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const item = trimmed.length > MAX_SCOPE_ITEM_CHARS ? trimmed.slice(0, MAX_SCOPE_ITEM_CHARS) : trimmed;
    if (looksLikePath(item) && !isGrounded(item, changedPaths)) continue;
    kept.push(item);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Confidence (R4) — a PURE function of the evidence actually gathered
// (`sources`), NEVER of model output. `RawIntent` above has no confidence
// field at all, so there is nothing to ignore — the model cannot self-report
// one even by accident.
// ---------------------------------------------------------------------------

/**
 * `high` when a resolved in-repo doc was read, OR an inline plan/spec was
 * detected, OR a linked issue was resolved (which, by construction, only
 * happens when `extractClosingIssueNumber` matched a documented closing
 * keyword — so "linked at all" already implies "matched by closing
 * keyword"). `medium` when the PR body carried enough real prose
 * (`pr_body` source, added by the caller only when `stripBodyNoise` clears
 * `MIN_BODY_PROSE_CHARS`) but none of the above. `low` otherwise — the
 * title/branch/commits/changed-paths-only case.
 */
export function computeConfidence(sources: readonly IntentSource[]): IntentConfidence {
  const kinds = new Set<IntentSourceKind>(sources.map((s) => s.kind));
  if (kinds.has('repo_doc') || kinds.has('inline_plan') || kinds.has('linked_issue')) return 'high';
  if (kinds.has('pr_body')) return 'medium';
  return 'low';
}
