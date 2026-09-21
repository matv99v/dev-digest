import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision } from 'drizzle-orm/pg-core';
import type { IntentSource } from '@devdigest/shared';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id'),
  /** The agent_run that produced this review (links the timeline run ↔ review). */
  runId: uuid('run_id'),
  kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
  verdict: text('verdict'),
  summary: text('summary'),
  score: integer('score'),
  model: text('model'),
  createdAt: now(),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  file: text('file').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  suggestion: text('suggestion'),
  confidence: doublePrecision('confidence').notNull(),
  kind: text('kind').notNull().default('finding'),
  trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
});

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  // ---- L03 PR Intent Layer (0013) --------------------------------------
  // Business-logic-driven and expected to evolve → TEXT + a hand-added CHECK
  // (see the 0013 migration header), not a PG ENUM. Drizzle's `{ enum }` here
  // is TYPES-ONLY: it narrows the TS type but emits no CHECK constraint.
  confidence: text('confidence', { enum: ['high', 'medium', 'low'] }).notNull().default('low'),
  // Read whole with the row, never queried by element → no child table, no
  // GIN index (mirrors inScope/outOfScope above).
  sources: jsonb('sources').$type<IntentSource[]>().notNull().default(sql`'[]'::jsonb`),
  // Staleness, half 1/2: the sha this intent was derived against. Every
  // writer knows pull.headSha (itself NOT NULL) and the table starts empty,
  // so NOT NULL removes a null branch from isIntentFresh.
  derivedFromSha: text('derived_from_sha').notNull(),
  // Staleness, half 2/2. timestamptz, never timestamp.
  derivedAt: timestamp('derived_at', { withTimezone: true }).defaultNow().notNull(),
  provider: text('provider'),
  model: text('model'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  // Deliberate deviation from "money is NUMERIC": mirrors agent_runs.cost_usd
  // (db/schema/runs.ts) — these are sub-cent price estimates, not ledger
  // money. NULL ⇒ unpriced model ⇒ UI shows '—', never '$0.00'.
  costUsd: doublePrecision('cost_usd'),
});

// ---- L04 Blast Radius — the Explain paragraph cache -----------------------
// A satellite of `pull_requests`, the `pr_intent` shape exactly: `pr_id` is
// both the primary key and a cascading FK, and it carries NO `workspace_id`
// of its own — it is unreachable except through a parent row that already
// carries one, and a duplicated column no constraint could keep in sync would
// drift while giving a false sense of a DB-enforced tenancy boundary. The
// boundary is enforced one layer up: every `pr_blast_summary` entry point
// resolves `workspaceId` via `getContext`, then loads the parent PR through
// the already-scoped `ReviewRepository.getPull(workspaceId, prId)`, throwing
// `NotFoundError` before any statement here ever runs
// (`modules/blast/service.ts`).
//
// Only the LLM paragraph is cached — the map itself (`changed_symbols` /
// `downstream` / `reverse`) is five SQL reads on indexed columns and is
// recomputed on every read (same posture as Smart Diff). This table exists
// only because the paragraph costs a model call.
//
// TWO freshness shas, not one: `derivedFromSha` (the PR head this paragraph
// described) and `derivedFromIndexSha` (the `repo_index_state.last_indexed_sha`
// the underlying map was read at). A single sha would miss a reindex that
// changes the map without moving the PR head, serving a paragraph describing
// callers that no longer exist.
//
// NO INDEXES beyond the primary key. Every access path is `WHERE pr_id = $1`,
// and `pr_id` is already a B-tree (the PK). Do not add a decorative one.
export const prBlastSummary = pgTable('pr_blast_summary', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  explanation: text('explanation').notNull(),
  derivedFromSha: text('derived_from_sha').notNull(),
  derivedFromIndexSha: text('derived_from_index_sha').notNull(),
  derivedAt: timestamp('derived_at', { withTimezone: true }).defaultNow().notNull(),
  provider: text('provider'),
  model: text('model'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  // Deliberate deviation from "money is NUMERIC": mirrors agent_runs.cost_usd
  // and pr_intent.cost_usd — sub-cent price estimates, not ledger money.
  // NULL ⇒ unpriced model ⇒ UI shows '—', never '$0.00'.
  costUsd: doublePrecision('cost_usd'),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
