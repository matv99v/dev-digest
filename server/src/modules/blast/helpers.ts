import type { ChatMessage, PrBlastRadius } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { BlastIndexState, BlastReverseImpact, BlastDependent, BlastExplanation } from '@devdigest/shared';
import type { DegradedReason } from '../repo-intel/types.js';
import { EXPLAIN_SYSTEM_PROMPT, MAX_DOWNSTREAM_SYMBOLS, STATUS_REASON } from './constants.js';

/**
 * Pure helpers for L04 Blast Radius — zero I/O, the tested surface (per
 * onion-architecture, mirrors `smart-diff/helpers.ts`). Every threshold used
 * here is imported from `constants.ts`; nothing is a literal.
 */

// ---------------------------------------------------------------------------
// Structural row shapes this module reads — kept local (not imported from the
// repo-intel facade's own interfaces beyond what's unavoidable) so this file
// stays easy to unit-test with plain object literals, the same convention
// `intent/helpers.ts`'s `IntentRow` follows.
// ---------------------------------------------------------------------------

export interface BlastChangedSymbolLike {
  file: string;
  name: string;
  kind: string;
}

export interface BlastCallerRowLike {
  file: string;
  symbol: string;
  viaSymbol: string;
  line: number;
}

export interface ReverseDependentRowLike {
  root: string;
  file: string;
  depth: number;
  via: string;
  endpoints: string[];
  crons: string[];
}

/** The raw `pr_blast_summary` row shape this module reads/writes. */
export interface BlastSummaryRow {
  prId: string;
  explanation: string;
  derivedFromSha: string;
  derivedFromIndexSha: string;
  derivedAt: Date;
  provider: string | null;
  model: string | null;
}

// ---------------------------------------------------------------------------
// status (R5) — driven by IndexState.status, NEVER IndexState.degraded:
// `partial` is a working index and carries no degraded flag
// (`repo-intel/repository.ts` — "'partial' is still a working index — no
// degraded flag"). `repoIntelEnabled` is checked FIRST and independently of
// the index's own state — a perfectly good index still yields `degraded` (not
// `none`) when the flag is off, because that path still returns real
// callers, just with `rank: 0` (the ripgrep fallback).
//
// `none` is the one state `IndexState.status` alone cannot name: a never-
// indexed repo and a repo whose indexer genuinely failed both surface as
// `status: 'degraded'|'failed'` with no persisted row backing them. The
// facade's own `getIndexState()` synthesises a row for "no persisted row
// exists" with `degradedReason: 'no_data'` SPECIFICALLY for that case
// (`repo-intel/service.ts` `getIndexState()`) — every other degraded/failed
// row an indexer stamps carries one of the other four `DegradedReason`
// values. That is the one signal available to tell "never indexed" apart
// from "an index attempt failed".
// ---------------------------------------------------------------------------

export interface IndexStateStatusLike {
  status: 'full' | 'partial' | 'degraded' | 'failed';
  degradedReason?: DegradedReason;
}

export interface MappedStatus {
  status: BlastIndexState;
  reason: string | null;
}

export function mapStatus(state: IndexStateStatusLike, repoIntelEnabled: boolean): MappedStatus {
  if (!repoIntelEnabled) return { status: 'degraded', reason: STATUS_REASON.flag_off };

  if (state.status === 'full') return { status: 'indexed', reason: null };
  if (state.status === 'partial') return { status: 'partial', reason: STATUS_REASON.partial };

  // 'degraded' | 'failed'
  if (state.degradedReason === 'no_data') return { status: 'none', reason: STATUS_REASON.none };
  const reason = state.degradedReason ? STATUS_REASON[state.degradedReason] : STATUS_REASON.index_failed;
  return { status: 'degraded', reason };
}

// ---------------------------------------------------------------------------
// summary (R14) — ALWAYS a non-empty, deterministic, counts-plus-status-word
// sentence, never the model's output (that lives in `explanation`) and never
// worded as an all-clear when the map is empty. Kept off the taxonomy of
// "safe"/"no impact"/"all clear" phrases on purpose — an empty map is not
// evidence of safety, only of what this index happens to know.
// ---------------------------------------------------------------------------

export interface BlastCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function buildSummary(counts: BlastCounts, status: BlastIndexState): string {
  const parts = [
    plural(counts.symbols, 'changed symbol'),
    plural(counts.callers, 'known caller'),
    plural(counts.endpoints, 'potentially affected endpoint'),
  ];
  if (counts.crons > 0) parts.push(plural(counts.crons, 'potentially affected cron job'));
  return `Blast radius (${status}): ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------------------
// downstream — group the facade's flat, per-caller `BlastCallerRow[]` by the
// changed symbol they reach (`viaSymbol`), attributing `endpoints_affected`/
// `crons_affected` ONLY from `factsByFile` entries of files that are actually
// callers of THAT symbol — never the flat, whole-PR union, which would make
// every symbol look equally dangerous (R14's spirit applied per-symbol).
// Capped at `MAX_DOWNSTREAM_SYMBOLS` groups, never a slice of the raw caller
// rows (that would truncate mid-symbol instead of dropping whole symbols).
// ---------------------------------------------------------------------------

export interface DownstreamImpactLike {
  symbol: string;
  callers: { name: string; file: string; line: number }[];
  endpoints_affected: string[];
  crons_affected: string[];
}

export function groupDownstream(
  changedSymbols: readonly BlastChangedSymbolLike[],
  callers: readonly BlastCallerRowLike[],
  factsByFile: Record<string, { endpoints: string[]; crons: string[] }> | undefined,
  maxSymbols: number = MAX_DOWNSTREAM_SYMBOLS,
): DownstreamImpactLike[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const s of changedSymbols) {
    if (!seen.has(s.name)) {
      seen.add(s.name);
      order.push(s.name);
    }
  }

  const result: DownstreamImpactLike[] = [];
  for (const name of order) {
    if (result.length >= maxSymbols) break;
    const symbolCallers = callers.filter((c) => c.viaSymbol === name);
    const callerFiles = new Set(symbolCallers.map((c) => c.file));
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const file of callerFiles) {
      const facts = factsByFile?.[file];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const c of facts.crons) crons.add(c);
    }
    result.push({
      symbol: name,
      callers: symbolCallers.map((c) => ({ name: c.symbol, file: c.file, line: c.line })),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// reverse — group the facade's flat `ReverseDependentRow[]` (root → file,
// depth, via, endpoints, crons) by `root` into one `BlastReverseImpact` per
// CHANGED FILE (not per changed symbol — the reverse walk is rooted at files,
// `getReverseDependents(repoId, files)`). Every changed file gets an entry,
// even with an empty `dependents: []`, so the shape stays stable regardless
// of whether anything imports it back. `via` is passed straight through —
// repo-intel already maps it `root → via → file` uniformly (the docblock on
// `ReverseDependentRow`: "the root itself at depth 1, the depth-1 file at
// depth 2"), so there is nothing left for this layer to compute.
// ---------------------------------------------------------------------------

export function buildReverseImpact(
  changedFiles: readonly string[],
  rows: readonly ReverseDependentRowLike[],
): BlastReverseImpact[] {
  const byRoot = new Map<string, BlastDependent[]>();
  for (const file of changedFiles) byRoot.set(file, []);
  for (const r of rows) {
    const arr = byRoot.get(r.root) ?? [];
    arr.push({ file: r.file, depth: r.depth, via: r.via, endpoints: r.endpoints, crons: r.crons });
    byRoot.set(r.root, arr);
  }
  return changedFiles.map((file) => ({ changed_file: file, dependents: byRoot.get(file) ?? [] }));
}

// ---------------------------------------------------------------------------
// callers_truncated (R2) — driven by `BlastResult.truncatedSymbols`, the
// EXACT per-symbol signal repo-intel computes with a fetch-(N+1) check in
// `getResolvedCallersRanked` (the (N+1)-th row coming back proves more
// existed; a post-cap COUNT alone cannot, because the dedup by
// `(file, enclosingSymbol, viaSymbol)` can collapse a genuinely-truncated
// symbol's caller list below `MAX_CALLERS_PER_SYMBOL`). NEVER derived from
// `callers.length === MAX_CALLERS_PER_SYMBOL` — that check under-reports
// exactly in the collision case and is indistinguishable from "exactly that
// many callers exist" in the no-collision case either way.
// ---------------------------------------------------------------------------

export function isCallersTruncated(truncatedSymbols: readonly string[] | undefined): boolean {
  return (truncatedSymbols?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// toPrBlastRadius — the one composition point. Everything above is combined
// here into the wire shape; `service.ts` calls this once per request and
// never builds the response object itself, so R14's "no empty result reads
// as an all-clear" and R11's "always the index sha" rules live in one place.
// ---------------------------------------------------------------------------

export interface BlastResultLike {
  changedSymbols: BlastChangedSymbolLike[];
  callers: BlastCallerRowLike[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  truncatedSymbols?: string[];
}

export function toPrBlastRadius(input: {
  blast: BlastResultLike;
  reverseRows: readonly ReverseDependentRowLike[];
  changedFiles: readonly string[];
  indexedSha: string | null;
  mapped: MappedStatus;
  summaryRow: BlastSummaryRow | undefined;
}): PrBlastRadius {
  const downstream = groupDownstream(input.blast.changedSymbols, input.blast.callers, input.blast.factsByFile);
  const reverse = buildReverseImpact(input.changedFiles, input.reverseRows);
  const endpoints = new Set(downstream.flatMap((d) => d.endpoints_affected));
  const crons = new Set(downstream.flatMap((d) => d.crons_affected));
  const counts: BlastCounts = {
    symbols: input.blast.changedSymbols.length,
    callers: input.blast.callers.length,
    endpoints: endpoints.size,
    crons: crons.size,
  };

  return {
    changed_symbols: input.blast.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream,
    summary: buildSummary(counts, input.mapped.status),
    status: input.mapped.status,
    reason: input.mapped.reason,
    indexed_sha: input.indexedSha,
    callers_truncated: isCallersTruncated(input.blast.truncatedSymbols),
    reverse,
    explanation: input.summaryRow ? toExplanation(input.summaryRow) : null,
  };
}

// ---------------------------------------------------------------------------
// explanation — the cached model paragraph.
// ---------------------------------------------------------------------------

export function toExplanation(row: BlastSummaryRow): BlastExplanation {
  return {
    text: row.explanation,
    model: row.model,
    provider: row.provider,
    derived_at: row.derivedAt.toISOString(),
  };
}

/**
 * Fresh iff the cached paragraph was derived at BOTH the PR's current head
 * sha AND the index sha the map was read at. The sha-only check `pr_intent`
 * uses is not enough here (*Fixed decisions*): a reindex changes the map
 * without moving the PR head, and a sha-only check would keep serving a
 * paragraph describing callers that no longer exist.
 */
export function isSummaryFresh(
  row: Pick<BlastSummaryRow, 'derivedFromSha' | 'derivedFromIndexSha'>,
  headSha: string,
  indexedSha: string | null,
): boolean {
  return row.derivedFromSha === headSha && row.derivedFromIndexSha === (indexedSha ?? '');
}

// ---------------------------------------------------------------------------
// The Explain prompt — plain `complete()`, not a review, so no reviewer-core
// prompt assembly. Repo-derived content (symbol/file names) is untrusted
// third-party data, so it's wrapped exactly like the review pipeline wraps
// the diff/PR body, with the matching instruction in `EXPLAIN_SYSTEM_PROMPT`.
// ---------------------------------------------------------------------------

export function buildExplainPrompt(input: {
  prTitle: string;
  status: BlastIndexState;
  reason: string | null;
  changedSymbols: readonly BlastChangedSymbolLike[];
  downstream: readonly DownstreamImpactLike[];
  reverse: readonly BlastReverseImpact[];
}): ChatMessage[] {
  const lines: string[] = [];
  lines.push(`PR title: ${input.prTitle || '(no title)'}`);
  lines.push(`Index status: ${input.status}${input.reason ? ` — ${input.reason}` : ''}`);
  lines.push('');
  lines.push(`Changed symbols (${input.changedSymbols.length}):`);
  for (const s of input.changedSymbols) lines.push(`- ${s.name} (${s.kind}) in ${s.file}`);
  lines.push('');
  lines.push('Callers per changed symbol (potentially affected, never confirmed reached):');
  for (const d of input.downstream) {
    const bits = [`${d.callers.length} caller(s)`];
    if (d.endpoints_affected.length > 0) bits.push(`endpoints: ${d.endpoints_affected.join(', ')}`);
    if (d.crons_affected.length > 0) bits.push(`crons: ${d.crons_affected.join(', ')}`);
    lines.push(`- ${d.symbol}: ${bits.join('; ')}`);
  }
  lines.push('');
  lines.push('Reverse import impact (files importing a changed file, up to two hops):');
  for (const r of input.reverse) {
    if (r.dependents.length === 0) continue;
    lines.push(`- ${r.changed_file}: ${r.dependents.map((d) => `${d.file} (depth ${d.depth})`).join(', ')}`);
  }

  const userContent = wrapUntrusted('blast-radius-map', lines.join('\n'));

  return [
    { role: 'system', content: EXPLAIN_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}
