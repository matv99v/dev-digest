# Examples

Good/bad pairs for the rules in this skill. Most are adapted from real code in
`server/` — see [in-this-repo.md](./in-this-repo.md).

## The route stops at the boundary

```ts
// ❌ Transport composing SQL. The table now has no owner, and the next endpoint
//    copies this — including the day someone forgets the workspace filter.
app.get('/workspace', async (req) => {
  const { workspaceId } = await getContext(container, req);
  const repos = await container.db
    .select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
  return { workspaceId, repos: repos.map(toSummary) };
});

// ✅ One call in, one shape out. The query lives with the table it belongs to.
app.get('/workspace', async (req) => {
  const { workspaceId } = await getContext(container, req);
  return service.overview(workspaceId);
});
```

## Depend on the port, not the implementation

```ts
// ❌ The service is now welded to Octokit: no mock can be substituted, and the
//    test that was meant to be hermetic makes a network call.
import { OctokitGitHubClient } from '../../adapters/github/octokit.js';

class PullService {
  private gh = new OctokitGitHubClient(token);
}

// ✅ The type is the port; the instance comes from the composition root.
class PullService {
  constructor(private container: Container) {}
  private get gh(): GitHubClient { return this.container.github; }
}
```

## Port first, then adapter

```ts
// ❌ Adapter written first, so the vendor's shape became the interface —
//    pagination, error types and all.
export class JiraClient {
  async searchIssues(jql: string): Promise<JiraSearchResponse> { … }
}

// ✅ The interface says what the application needs; the vendor adapts to it.
// vendor/shared/adapters.ts  (edit BOTH copies)
export interface IssueTracker {
  findIssuesForBranch(branch: string): Promise<IssueMeta[]>;
}
// adapters/issues/jira.ts
export class JiraIssueTracker implements IssueTracker { … }
```

## No HTTP below the route

```ts
// ❌ Now the service can only be called from an HTTP handler — not from the job
//    runner, not from a test, without fabricating a request object.
async summarize(req: FastifyRequest, prId: string) {
  const workspaceId = req.headers['x-workspace'] as string;
  …
}

// ✅ The route unpacks the request; the service takes values.
async summarize(workspaceId: string, prId: string) { … }
```

## The rule is a function, not a method on a service

```ts
// ❌ Testing the score means constructing a service and mocking a repository.
class ReviewService {
  async summarize(runId: string) {
    const findings = await this.repo.findingsFor(runId);
    let score = 100;
    for (const f of findings) score -= f.severity === 'critical' ? 25 : 5;
    return { score: Math.max(0, score), verdict: score < 50 ? 'request_changes' : 'comment' };
  }
}

// ✅ helpers.ts — callable from a test with no await, no mock, no container.
export function scoreFindings(findings: Finding[]): ReviewSummary { … }

// service.ts — fetch, then delegate.
async summarize(runId: string) {
  return scoreFindings(await this.repo.findingsFor(runId));
}
```

## Tenancy belongs to the repository

```ts
// ❌ Correct only as long as every caller remembers. One that forgets returns
//    another workspace's data, and nothing fails loudly.
async getById(id: string) {
  const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, id));
  return row;
}

// ✅ Scope is part of the signature, so forgetting is a type error.
async getById(workspaceId: string, id: string) {
  const [row] = await this.db.select().from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
  return row;
}
```

## The service opens the transaction

```ts
// ❌ Two repositories, two units of work. A failure between them leaves a
//    review with no findings and nothing to reconcile it.
const review = await this.reviews.create(input);
await this.findings.insertMany(review.id, findings);

// ✅ One unit of work, opened one ring out and passed down.
await this.db.transaction(async (tx) => {
  const review = await this.reviews.create(tx, input);
  await this.findings.insertMany(tx, review.id, findings);
});
```

Repository methods that may participate take the executor first and default to `db`, so
single-query callers are unchanged.

## Driver errors become domain errors

```ts
// ❌ A 500 whose message was written for a DBA, leaking the schema on the way out.
await this.db.insert(t.repos).values(row);

// ✅ Translated at the boundary that already owns the table.
try {
  await this.db.insert(t.repos).values(row);
} catch (e) {
  if (isUniqueViolation(e)) throw new ValidationError('Repository already added');
  throw new ExternalServiceError('Could not save repository', { cause: e });
}
```

## Rows are storage; contracts are the promise

```ts
// ❌ The API response is now whatever the column list happens to be — including
//    internal flags, and a rename ships as a breaking change.
app.get('/repos', async (req) => repository.list(workspaceId));

// ✅ helpers.ts maps the row onto the shared contract.
export const toRepoDto = (r: RepoRow): Repo => ({ … });
```

Sharing the *row type* through `db/rows.ts` is fine and deliberate — see
[in-this-repo.md](./in-this-repo.md). Sharing the row as an API *response* is not.

## Reach through the composition root, not into a sibling

```ts
// ❌ Two modules now share a private file; changing it means checking both.
import { AgentsRepository } from '../agents/repository.js';

// ✅ Shared repositories are constructed in the container.
const agents = this.container.agentsRepo;
```

## Not every boundary needs a port

```ts
// ❌ An interface with one implementation, no mock, and no external system to
//    invert. Ceremony — and 5x more test code than tested code [4].
export interface DiffParser { parse(patch: string): ParsedDiff; }
export class UnifiedDiffParser implements DiffParser { … }

// ✅ It is a pure function over data. Import it and call it.
export function parseUnifiedDiff(patch: string): ParsedDiff { … }
```

## Don't add a layer that only forwards

```ts
// ❌ The middle man: indirection with no added semantics [4].
class WorkspaceService {
  constructor(private repo: WorkspaceRepository) {}
  list(workspaceId: string) { return this.repo.list(workspaceId); }
}

// ✅ Until there is a decision, a sequence, or a second caller, the route calls
//    the repository. Add the service when it has something to do.
app.get('/workspace', async (req) => repository.list(workspaceId));
```

Note the asymmetry with the first example, and that it is deliberate: skipping the
*service* is a judgement call you can revisit cheaply; putting the *query* in the route
is a leak that spreads.
