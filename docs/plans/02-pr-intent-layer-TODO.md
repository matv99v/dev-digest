# L03 PR Intent Layer — review findings

**Status: all findings resolved, T13 tests written.** Kept as the record of what review
found and how each item was closed.

## Findings and resolutions

### 1. RESOLVED — the executor's "derivation failed" log line was unreachable

`IntentService.deriveForRun` returned `null` on any failure, swallowing the reason. The
executor's `catch` block — the only thing that logged `intent: derivation failed —
continuing without the Intent section` — could therefore never fire. On a real derive
failure the Live Log showed `intent: deriving…` and then silence. The run still completed
(R7's "never fails the run" held), but the plan's manual-verification step 8 expects that
failure line.

Root cause was an internal contradiction in the plan itself: T10 §4 mandates `deriveForRun`
"never throws"; T12's snippet assumes it can throw and logs accordingly.

**Fix:** `deriveForRun` now returns a discriminated result — `{ ok: true, intent, detail,
tokensIn, tokensOut, costUsd } | { ok: false, reason: string }` — instead of `null`. The
executor branches on `derived.ok` and logs `reason` on the failure path. Its own try/catch
is kept as defense in depth for anything throwing upstream of the call. This keeps T10's
"never throws" and makes T12's log line reachable, without plumbing `RunLogger` into the
service.

Chosen over the alternative (passing `runLog` into `IntentService`), which would have
widened the service's constructor and coupled it to the run-logging concern.

**Now covered by:** `server/test/intent.it.test.ts` — "a derivation failure never fails the
run: every run reaches done, the prompt has no Intent, the log line is info", which asserts
the line appears AND that no intent log line has `kind: 'error'`.

### 2. RESOLVED — `PromptAssembly.intent` docblock overstated what is stored

The contract's docblock claimed the value was "wrapped in `<untrusted>`", but
`reviewer-core/src/prompt.ts` sets `assembly.intent = parts.intent ?? null` — the raw,
unwrapped, untruncated string. The wrapped and truncated form only ever exists as the
prompt text itself.

No behavioural bug (server-side `MAX_INTENT_CHARS = 600` never reaches the 2000-char prompt
cap), and the sibling `pr_description` field behaves identically — it just was not
documented as such. The plan specified that assignment literally, so the code was correct
and the comment was wrong.

**Fix:** reworded the docblock in both vendored copies to say the field stores the raw
value and that the `## Intent` prompt section is what wraps and truncates it.

**Now covered by:** `reviewer-core/test/prompt.test.ts` — the truncation case pins the
raw-vs-truncated asymmetry explicitly (prompt text is exactly 2000 chars, `assembly.intent`
stays the full 5000-char input).

### 3. RESOLVED — `contracts/trace.ts` drift between the two vendored copies

T2 said "reconcile, do not clobber". The `intent` field had landed identically in both, but
two pre-existing docblocks still differed (`T1.3`/`T3` task-id references vs `repo-intel`).

**Fix:** reconciled onto the `repo-intel` wording — task ids rot, the subsystem name does
not. `diff` of the two copies is now empty.

### 4. OPEN (cosmetic, no action taken) — Intent trace-row colour

`PROMPT_COLORS.intent = "var(--info)"` resolves to `#6b7280`, visually close to
`--text-muted`, which the `system` row in the same panel already uses. This was the plan's
own explicit colour assignment, not an implementer's choice. Left as specified — worth a
look during a visual pass if the two rows read as the same colour.

## Tests written (T13, previously skipped)

| File | Cases |
|---|---|
| `server/test/intent-helpers.test.ts` | 20 — `isIntentFresh` (3), `computeConfidence` (4), `detectInlinePlan` (5, incl. the untruncated-past-4000-chars case), `RawIntent` key set (2), `dropUngroundedScope` (3), `extractClosingIssueNumber` (3) |
| `server/test/intent-docs.test.ts` | 14 — `resolveRepoDocPath` rejections one class per case (7), acceptances (3), `loadCandidateDocs` incl. a throwing `GitClient`, the mock's empty-string path, `MAX_DOCS`, and proof a rejected candidate never reaches `readFile` (4) |
| `server/test/intent.it.test.ts` | 6 — POST→GET column round-trip, null-body-not-404, cross-workspace 404 with no row written, cache reuse with zero derivation calls, best-effort failure path, tokens not folded into `agent_runs` |
| `reviewer-core/test/prompt.test.ts` | +3 — section present/wrapped/ordered, absent when omitted, truncation vs raw `assembly.intent` |
| `reviewer-core/test/run.test.ts` | +1 — map-reduce path carries `outcome.assembly.intent` |
| `client/…/IntentCard.test.tsx` | 3 — empty state with working derive action, confidence badge as text, stale marker on/off |
| `client/…/TraceBody.test.tsx` | 3 — intent present / explicit null / key absent entirely |

Two integration cases initially failed on test-authoring mistakes, not product bugs: a PR
body shorter than `MIN_BODY_PROSE_CHARS` (so confidence was correctly `low`, not `medium`),
and asserting `{ level, message }` on log lines whose real shape is `{ t, kind, msg }`. Both
fixed in the tests; no product code was changed to make a test pass.

## Final verification

| Check | Result |
|---|---|
| `server pnpm typecheck` | pass |
| `server` unit (hermetic) | 201 passed, 23 files |
| `server` integration (Docker) | 53 passed, 10 files |
| `reviewer-core typecheck && test` | 27 passed, 3 files |
| `client typecheck && test` | 95 passed, 24 files |

All 12 requirements (R1–R12) now have both a code path and the test the plan named for them.
