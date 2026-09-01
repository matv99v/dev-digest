/**
 * Built-in skill bodies used by the seed (L02 — Skills). A skill is pure
 * markdown config, phrased directively — it is appended verbatim (or, for a
 * non-manual source, delimiter-wrapped) into the `## Skills / rules` section
 * of the review prompt. `description` is the skill's INTERFACE — a short,
 * directive summary shown on its card and in the agent's Skills tab — while
 * `body` is the instruction the reviewing agent actually reads.
 *
 * The catalog splits into two groups:
 *  - `no-then-chains`, `secret-leakage-gate`, `lethal-trifecta`,
 *    `phantom-api-gate`, `pr-quality-rubric` — match the product design
 *    exactly (name/type/source/enabled), `pr-quality-rubric` linked to
 *    Security Reviewer as shown there.
 *  - `test-coverage-nudge`, `edge-case-coverage`, `mock-overuse-gate`,
 *    `api-contract-guard` — cover what the design doesn't (it never shows
 *    Test Quality Reviewer or General Reviewer), needed for the product's
 *    own control-experiment requirements.
 */

export interface SeedSkillDef {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  source: 'manual' | 'imported_url' | 'extracted' | 'community';
  /** Defaults to true. */
  enabled?: boolean;
  body: string;
}

export const PR_QUALITY_RUBRIC_SKILL: SeedSkillDef = {
  name: 'pr-quality-rubric',
  description: 'Rubric for evaluating overall PR quality across correctness, tests, and clarity.',
  type: 'rubric',
  source: 'manual',
  body: `# PR Quality Rubric
Evaluate the pull request against the following dimensions. For each, return a
finding only when the issue is **worth the author's time** — aim for 5 high-signal
findings, not 50.

## Correctness
- Does the change do what the PR description claims?
- Are edge cases (empty input, nulls, concurrency) handled?

## Security
- Any secrets, tokens, or credentials in the diff?
- Untrusted input reaching a sink (SQL, shell, fetch)?

## Tests
- New branches covered by assertions?
- Are tests meaningful (not just snapshot churn)?

## Scope
- Does the diff stay within the stated intent?
- Flag out-of-scope changes separately rather than blocking.`,
};

export const NO_THEN_CHAINS_SKILL: SeedSkillDef = {
  name: 'no-then-chains',
  description: 'House rule: always use async/await instead of .then() promise chains.',
  type: 'convention',
  // "Extracted" — this house rule is the kind of thing the (out-of-scope)
  // Conventions extractor would turn into a skill from a repo scan; seeded
  // directly here rather than building that extractor flow.
  source: 'extracted',
  body: `# No then-chains
This codebase's house rule is \`async\`/\`await\` throughout — flag any \`.then()\` /
\`.catch()\` promise chain introduced or changed by this diff.

A \`.then()\` chain is worth flagging when it could be a plain \`await\` with no
behavior change. It is NOT worth flagging when the diff or PR description
states a genuine reason (e.g. \`Promise.all\`/\`Promise.race\` orchestration, a
callback-style third-party API with no promise wrapper).

Do not flag \`.then()\` in vendored, generated, or test-fixture code, or a chain
that predates this diff and is unchanged.`,
};

export const SECRET_LEAKAGE_GATE_SKILL: SeedSkillDef = {
  name: 'secret-leakage-gate',
  description: 'Detects sk_live, service_role, and NEXT_PUBLIC_ keys leaking into the diff.',
  type: 'security',
  source: 'community',
  body: `# Secret leakage gate
Flag any literal credential VALUE added to the diff — not a reference to where
one is stored, the literal value itself:
- A Stripe-style secret key (\`sk_live_...\`, \`sk_test_...\`).
- A Supabase/Postgres \`service_role\` key or a connection string with a password.
- A value assigned to a \`NEXT_PUBLIC_*\` (or other client-bundled) env var that
  is actually a private key or secret, not something meant to reach the browser.
- Any other API token, password, or private key pasted as a string literal.

A \`.env.example\` with placeholder values, a variable NAME with no literal
value, or a secret already flagged on an earlier, unchanged line does not
count — only a genuinely new literal secret in this diff.`,
};

export const LETHAL_TRIFECTA_SKILL: SeedSkillDef = {
  name: 'lethal-trifecta',
  description: 'Flags PRs combining private data access, untrusted input, and an exfiltration path.',
  type: 'security',
  source: 'community',
  body: `# Lethal trifecta
Flag a "lethal trifecta" only when this diff introduces ALL THREE, each
citable with its own file:line:
1. **Untrusted content** reaching an LLM/agent (a PR body, a fetched web page,
   a file, or tool output the agent ingests).
2. That same LLM/agent also has **access to private data**.
3. A **way to exfiltrate it** (an outbound call, a tool, output an attacker
   can read).

An authenticated API that returns data to a logged-in user is NOT a lethal
trifecta, even when the data is sensitive — that is ordinary access control.
\`request param → DB read → JSON response\` is never a trifecta. When only one
or two of the three legs are present, report it as a normal
access-control/data-exposure finding instead — a false trifecta is worse than
none.`,
};

export const PHANTOM_API_GATE_SKILL: SeedSkillDef = {
  name: 'phantom-api-gate',
  description: "Detects imports of functions/modules that don't exist in the target file.",
  type: 'security',
  source: 'imported_url',
  // Freshly imported, not yet vetted — matches the "needs vetting" state a
  // real import produces (see ImportDrawer), just via the seed instead of a
  // live upload.
  enabled: false,
  body: `# Phantom API gate
Flag an \`import\`/\`require\` in this diff that references a named export,
function, or module that does not actually exist at that path — a "phantom"
reference (a common LLM-authored-code mistake): a typo'd export name, a
function renamed/removed on one side of a refactor but still imported
elsewhere, or a module path that doesn't resolve.

Only flag what you can verify doesn't exist by reading the target file/module
in the diff or surrounding context — do not guess from the name alone.`,
};

export const TEST_COVERAGE_NUDGE_SKILL: SeedSkillDef = {
  name: 'test-coverage-nudge',
  description: 'Suggests tests when new branches lack coverage.',
  type: 'custom',
  source: 'manual',
  body: `# Test coverage nudge
Flag any conditional branch, error path, or early return that this diff added
or changed and that no test in the diff exercises. Name the specific branch
and the input or condition that would take it — a test that merely imports
the file, or whose assertion would pass on either branch, does not count as
exercising it.

Do not flag a branch that existed before this diff and is unchanged, even if
untested — that's pre-existing debt, not something this diff introduced.`,
};

export const EDGE_CASE_COVERAGE_SKILL: SeedSkillDef = {
  name: 'edge-case-coverage',
  description:
    'Flag missing tests for boundary values — empty/null/undefined input, zero-length collections, and off-by-one conditions — on code this diff changed.',
  type: 'rubric',
  source: 'manual',
  body: `# Edge case coverage
For code this diff added or changed, check whether the tests cover the
boundary values that code's logic depends on:
- Empty, null, or undefined input where the code assumes something is present.
- A zero-length or single-element collection where the code loops, slices, or
  compares against a length.
- An off-by-one edge on any bound (\`<\` vs \`<=\`, first/last index, inclusive vs
  exclusive range).
- The first and last value of an enum or a fixed set of states the code
  switches on.

Only flag a boundary that the changed code's own logic makes meaningful — do
not ask for generic "add more edge case tests" without naming the specific
boundary and why the current tests would miss a bug there.`,
};

export const MOCK_OVERUSE_GATE_SKILL: SeedSkillDef = {
  name: 'mock-overuse-gate',
  description:
    'Flag tests that mock so much of the unit under test that a real regression in the mocked part would not fail the test.',
  type: 'convention',
  source: 'manual',
  body: `# Mock overuse gate
Flag a test where the thing that would actually break in production is
inside a mock, so the test cannot catch a real regression there — for example
mocking the function under test's own core logic, mocking a DB/query layer
and then asserting only that it "was called" rather than on any real
computed result, or stubbing every collaborator so the test exercises only
glue code.

Distinguish this from legitimate mocking of true external boundaries (network,
filesystem, time, a third-party SDK) — that is normal and should not be
flagged. The question is always: if the mocked-out logic were subtly wrong,
would this test still pass?`,
};

export const API_CONTRACT_GUARD_SKILL: SeedSkillDef = {
  name: 'api-contract-guard',
  description:
    'Flag a change to a route’s request or response shape, status codes, or field types/nullability that breaks an existing caller without a version bump or migration path.',
  type: 'convention',
  source: 'manual',
  body: `# API contract guard
For any HTTP route touched by this diff, check whether its request or response
contract changed in a way that breaks an existing caller:
- A response field removed, renamed, or its type/nullability changed.
- A previously optional request field made required, or a required field
  removed.
- A status code that a route used to return no longer being returned for the
  same condition (e.g. 404 silently becoming 200 with an empty body).
- A route's path or HTTP method changed without the old one still working.

Do not flag additive, backward-compatible changes (a new optional field, a new
route, a new enum member a client would reasonably ignore) — only genuine
breaking changes. When you flag one, name the exact field/status/path and the
kind of caller it would break.`,
};

/** The full catalog seeded on a fresh workspace. */
export const SKILL_CATALOG: SeedSkillDef[] = [
  PR_QUALITY_RUBRIC_SKILL,
  NO_THEN_CHAINS_SKILL,
  SECRET_LEAKAGE_GATE_SKILL,
  LETHAL_TRIFECTA_SKILL,
  PHANTOM_API_GATE_SKILL,
  TEST_COVERAGE_NUDGE_SKILL,
  EDGE_CASE_COVERAGE_SKILL,
  MOCK_OVERUSE_GATE_SKILL,
  API_CONTRACT_GUARD_SKILL,
];

/**
 * Agent↔skill links seeded on a fresh workspace. Not every catalog skill is
 * linked — `no-then-chains` and `phantom-api-gate` sit in the catalog
 * unattached, exactly as the design shows them for Security Reviewer.
 */
export const SEED_SKILL_LINKS: Array<{ skillName: string; agentName: string; order: number }> = [
  { skillName: 'pr-quality-rubric', agentName: 'Security Reviewer', order: 0 },
  { skillName: 'secret-leakage-gate', agentName: 'Security Reviewer', order: 1 },
  { skillName: 'lethal-trifecta', agentName: 'Security Reviewer', order: 2 },
  { skillName: 'test-coverage-nudge', agentName: 'Test Quality Reviewer', order: 0 },
  { skillName: 'edge-case-coverage', agentName: 'Test Quality Reviewer', order: 1 },
  { skillName: 'mock-overuse-gate', agentName: 'Test Quality Reviewer', order: 2 },
  { skillName: 'api-contract-guard', agentName: 'General Reviewer', order: 0 },
];
