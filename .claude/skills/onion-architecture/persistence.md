# Persistence and the ORM boundary

## The repository owns a table (HIGH)

One repository owns a set of tables and is the only code that queries them. Everything
else — services, routes, jobs, other modules — goes through its methods.

The value is not abstraction for its own sake. It is that the table has an owner: one
place to add a tenancy filter, one place to change when a column is renamed, one place
to read when you need to know how the data is actually accessed.

Cross-module access is the case people get wrong. If module B needs module A's data, it
does **not** import `modules/a/repository.ts`. Either the repository is promoted to the
composition root and reached via `container.<name>Repo`, or A exposes a service method.
A direct sibling import creates a dependency between modules that no layering rule
catches, because both files are in the same ring.

## What must not escape, and what may (CRITICAL)

The rule is usually stated as "don't leak ORM types", which is too blunt to follow. The
useful split is between the **query language** and the **data shapes**.

**Must not escape — the query language.** Drizzle's builder and operators (`eq`, `and`,
`sql`, `.select()`, `.where()`) stay inside repositories. The moment a service composes
a `where` clause, the repository has stopped being the table's owner and every future
query is negotiable. This is the boundary that actually protects you.

**May escape — inferred row types**, in this codebase, deliberately. `db/rows.ts`
exports `$inferSelect` types precisely so cross-cutting consumers can name a row shape
without importing another module's data layer. It is a considered trade: the type is
generated from the schema, so it cannot drift, and sharing it removes a much worse
coupling. Do not "fix" this.

**Must be mapped — anything crossing the HTTP boundary.** What a route returns is a Zod
contract from `@devdigest/shared`, not a row. The mapping is a pure helper
(`toRepoDto`), because a row is a storage detail — nullable columns, snake_case
leftovers, internal flags — and an API response is a promise to a client. Sentry's
write-up on the same boundary: "we'll be using that type in the application layer, so no
database-related imports are allowed" [8].

## Tenancy is a repository invariant (CRITICAL)

Every query is scoped by `workspaceId`. Not "callers should remember to pass it" — the
method signature takes it and the `where` clause uses it, so forgetting is a type error
rather than a data leak.

```ts
async list(workspaceId: string): Promise<RepoRow[]> {
  return this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
}
```

Where a table has no `workspace_id` of its own, scope through the row that does (a
finding scopes via its review, which scopes via its PR). The invariant is that no
repository method can return another workspace's data, however deep the join.

## Transactions (HIGH)

Drizzle's transaction is a callback receiving a `tx` object with the same API as `db`;
throwing inside it rolls everything back, and `tx.rollback()` rolls back explicitly [9].

The question layering has to answer is *who opens it*. A transaction spanning two
repositories cannot be opened inside either of them, so it is opened one ring out — in
the service — and the `tx` handle is passed down [8]:

```ts
// service.ts — the service decides the unit of work
await this.db.transaction(async (tx) => {
  const review = await this.reviews.create(tx, input);
  await this.findings.insertMany(tx, review.id, findings);
});
```

Repository methods that may participate take the executor as their first parameter and
default to the module's `db`. This keeps single-query callers unchanged while making
multi-repository atomicity possible without either repository knowing about the other.

Note the trap in `tx.rollback()`: it works by throwing its own exception [8][9]. A
`try/catch` inside the transaction callback that swallows errors will also swallow the
rollback signal. Catch narrowly, or let it propagate.

## Database errors become domain errors (HIGH)

A `postgres` driver error reaching a route handler produces a 500 with a message written
for a DBA. Translate at the boundary you already own — the repository — into the
`platform/errors.ts` taxonomy:

| Situation | Throw |
|---|---|
| Row absent where the caller required one | `NotFoundError` (404) |
| Unique violation on a user-supplied value | `ValidationError` (422) |
| Driver/connection failure | `ExternalServiceError` (502) |

The API's error envelope (`{ error: { code, message, details } }`) is produced once by
the shared error handler from these classes, so a translated error is automatically
well-formed. An untranslated one is not.

"Row absent" deserves a decision rather than a default: a repository `getById` returning
`undefined` is a fine, honest signature when absence is a normal case the caller
handles. Throw `NotFoundError` where absence is genuinely exceptional. What is not fine
is returning `undefined` and letting a `!` further out turn it into a `TypeError`.

## Growing a repository (MEDIUM)

When a repository outgrows one file, split by **aggregate** and compose behind the
existing class, so callers see no change:

```
modules/reviews/
  repository.ts            ← the public class; composes the three below
  repository/
    review.repo.ts         ← reviews + findings
    run.repo.ts            ← agent_runs + run_traces
    pull.repo.ts           ← pull requests + intent
```

Splitting by *operation* instead (`read.repo.ts` / `write.repo.ts`) looks tidier and is
worse: it separates the two halves of the same invariant, so a change to how a review is
stored has to be made in two files that no longer explain each other.
