import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, PR #483 (a controlled test-quality fixture — an
 * uncovered branch with only a happy-path test), three skill rows (rubric +
 * convention) linked to a fourth built-in agent, and the four built-in agents
 * (General + Security + Performance + Test Quality), all on the default
 * openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (conventions, memory, eval, …)
 * once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- PR #483 (test-quality fixture: uncovered branch, happy-path-only test) ----
  // Adds parseRetryAfter() with an explicit negative/zero/malformed-input branch,
  // plus a test file that only exercises the valid-input happy path. Lets a human
  // demonstrate the Test Quality Reviewer with its 3 skills OFF (misses the gap)
  // vs ON (uncovered-branch-gate catches it).
  let [pr483] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 483)));
  if (!pr483) {
    [pr483] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 483,
        title: 'Add retry-after parsing for rate-limited responses',
        author: 'diego.ruiz',
        branch: 'feat/retry-after-parsing',
        base: 'main',
        headSha: 'f7a8b9c0d1e2',
        additions: 21,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
        body: 'Parses the Retry-After header so callers know how long to back off.',
      })
      .returning();

    await db.insert(t.prFiles).values([
      {
        prId: pr483!.id,
        path: 'src/lib/parse-retry-after.ts',
        additions: 13,
        deletions: 0,
        patch:
          '@@ -0,0 +1,13 @@\n' +
          '+/**\n' +
          '+ * Parses the Retry-After header value into a number of seconds to wait\n' +
          '+ * before retrying a rate-limited request. Falls back to a default when the\n' +
          "+ * header is missing or the value can't be trusted.\n" +
          '+ */\n' +
          '+const DEFAULT_RETRY_AFTER_SECONDS = 30;\n' +
          '+\n' +
          '+export function parseRetryAfter(header: string | undefined): number {\n' +
          '+  if (!header) return DEFAULT_RETRY_AFTER_SECONDS;\n' +
          '+  const parsed = Number.parseInt(header, 10);\n' +
          '+  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RETRY_AFTER_SECONDS;\n' +
          '+  return parsed;\n' +
          '+}',
      },
      {
        prId: pr483!.id,
        path: 'src/lib/parse-retry-after.test.ts',
        additions: 8,
        deletions: 0,
        patch:
          '@@ -0,0 +1,8 @@\n' +
          "+import { describe, it, expect } from 'vitest';\n" +
          "+import { parseRetryAfter } from './parse-retry-after.js';\n" +
          '+\n' +
          "+describe('parseRetryAfter', () => {\n" +
          "+  it('parses a valid Retry-After header into seconds', () => {\n" +
          "+    expect(parseRetryAfter('120')).toBe(120);\n" +
          '+  });\n' +
          '+});',
      },
    ]);

    await db.insert(t.prCommits).values({
      prId: pr483!.id,
      sha: 'f7a8b9c0d1e2',
      message: 'Parse Retry-After header with a default fallback',
      author: 'diego.ruiz',
    });
  }

  // ---- skills (rubric/convention rows for the Test Quality Reviewer) ----
  const seedSkills: Array<{
    name: string;
    description: string;
    type: (typeof t.skills.$inferInsert)['type'];
    body: string;
  }> = [
    {
      name: 'uncovered-branch-gate',
      description:
        "Flags a new or changed conditional branch whose non-happy-path outcome has no test.",
      type: 'rubric',
      body: `# Uncovered Branch Gate
- Every new or changed conditional branch (if/else, guard clause, switch case,
  thrown error, early return) needs a test exercising its non-happy-path
  outcome.
- If the diff adds a branch but the accompanying test only covers the
  default/success path, flag it.
- Name the specific input or condition that would reach the untested branch.`,
    },
    {
      name: 'mock-overuse-gate',
      description:
        "Flags tests that mock the unit under test or assert on a mock's internal call shape instead of real behaviour.",
      type: 'convention',
      body: `# Mock Overuse Gate
- Don't mock the unit actually under test — only mock its collaborators and
  boundaries (DB, network, filesystem, clock).
- Don't let asserting on a mock's internal call args/shape be the test's real
  assertion; assert on observable behaviour instead.
- A test should fail if the real implementation is deleted or broken. If it
  would still pass, the mock has swallowed the behaviour under test.`,
    },
    {
      name: 'flaky-test-smells',
      description:
        'Flags real timers, unseeded randomness, order-dependent tests, real network calls, and unawaited async assertions.',
      type: 'convention',
      body: `# Flaky Test Smells
- Flag real timers or sleeps (\`setTimeout\`, \`sleep\`) instead of fake timers
  or a deterministic await.
- Flag unseeded randomness or \`Date.now()\` driving an assertion.
- Flag order-dependent tests that only pass because of shared state left by
  an earlier test.
- Flag real (unmocked) network calls in a unit test.
- Flag unawaited async assertions that can silently pass without ever
  running.`,
    },
  ];

  const skillIds: Record<string, string> = {};
  for (const s of seedSkills) {
    let [existingSkill] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
    if (!existingSkill) {
      [existingSkill] = await db
        .insert(t.skills)
        .values({
          workspaceId,
          name: s.name,
          description: s.description,
          type: s.type,
          source: 'manual',
          body: s.body,
          enabled: true,
          version: 1,
        })
        .returning();
      await db.insert(t.skillVersions).values({
        skillId: existingSkill!.id,
        version: 1,
        body: s.body,
        message: 'Initial version',
      });
    }
    skillIds[s.name] = existingSkill!.id;
  }

  // ---- built-in agents (the four starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description:
        'Checks test quality — uncovered branches, missed corner cases, mock overuse, and flaky-test smells.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- link the 3 test-quality skills to the Test Quality Reviewer agent ----
  const [testQualityAgent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')));
  if (testQualityAgent) {
    const linkedSkillOrder = ['uncovered-branch-gate', 'mock-overuse-gate', 'flaky-test-smells'];
    for (let i = 0; i < linkedSkillOrder.length; i++) {
      const skillId = skillIds[linkedSkillOrder[i]!];
      if (!skillId) continue;
      await db
        .insert(t.agentSkills)
        .values({ agentId: testQualityAgent.id, skillId, order: i, enabled: true })
        .onConflictDoNothing();
    }
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
