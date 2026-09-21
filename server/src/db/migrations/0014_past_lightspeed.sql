-- L04 Blast Radius — `pr_blast_summary`, the cached Explain paragraph.
--
-- A satellite of `pull_requests`, the `pr_intent` shape exactly: `pr_id` is
-- both the primary key and a cascading FK. `workspace_id` IS DELIBERATELY
-- ABSENT — this is not a domain table under server/AGENTS.md's "every domain
-- table carries workspace_id" invariant, it is unreachable except through a
-- parent row that already carries one, and duplicating that column here would
-- be a denormalization no constraint could keep in sync — it would drift
-- silently while giving a false sense of a DB-enforced tenancy boundary. The
-- boundary is enforced ONE LAYER UP instead: every entry point resolves
-- `workspaceId` via `getContext`, then loads the parent PR through the
-- already-scoped `ReviewRepository.getPull(workspaceId, prId)`, throwing
-- `NotFoundError` before any statement against this table ever runs
-- (`modules/blast/service.ts`).
--
-- Only the LLM paragraph is cached here — the map itself (changed symbols,
-- callers, reverse impact) is five SQL reads on already-indexed columns and
-- is recomputed on every `GET`, never persisted (same posture as Smart Diff,
-- `04-smart-diff.md:47`). This table exists only because the paragraph costs
-- a model call.
--
-- TWO freshness shas, not one: `derived_from_sha` (the PR head this paragraph
-- described) and `derived_from_index_sha` (the `repo_index_state` sha the
-- underlying map was read at). A single sha would miss a reindex that changes
-- the map without moving the PR head, silently serving a paragraph describing
-- callers that no longer exist.
--
-- NO INDEXES beyond the primary key. Every access path is `WHERE pr_id = $1`,
-- and `pr_id` is already a B-tree (the PK). Do not add a decorative one.
CREATE TABLE "pr_blast_summary" (
	"pr_id" uuid PRIMARY KEY NOT NULL,
	"explanation" text NOT NULL,
	"derived_from_sha" text NOT NULL,
	"derived_from_index_sha" text NOT NULL,
	"derived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_usd" double precision
);
--> statement-breakpoint
ALTER TABLE "pr_blast_summary" ADD CONSTRAINT "pr_blast_summary_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;