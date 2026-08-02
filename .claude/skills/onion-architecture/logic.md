# Business rules, services, and when not to add a layer

## Three kinds of backend logic (HIGH)

Most layering arguments dissolve once the logic is classified. Ask what the code needs
in order to run:

| Kind | Needs | Lives in | Tested by |
|---|---|---|---|
| **Domain** | Nothing. Inputs → output | `helpers.ts`, contracts | Calling it |
| **Application** | Collaborators: repository, ports, jobs | `service.ts` | Mocks via `ContainerOverrides` |
| **Transport** | An HTTP request | `routes.ts` | Integration test |

Domain logic is the part worth protecting, because it is the part that is genuinely
yours — parsing a repo URL, grounding findings against a diff, deciding a verdict from
severities, computing a cost from token counts. None of it needs a database or a
network, so none of it should be reachable only through one.

The test for "is this domain logic?" is whether you can call it from a `.test.ts` with
no `await`, no mock, and no container. If yes, it belongs in a pure helper regardless of
how deep in a service it currently sits.

## The anemic-service trap (MEDIUM)

The most common failure of this architecture is not a leak — it is a service that
becomes the only place anything happens, with every other file reduced to plumbing.
Fowler names the shape and the cost [3]:

> "The catch comes when you look at the behavior, and you realize that there is hardly
> any behavior on these objects, making them little more than bags of getters and
> setters."

> "The problem with anemic domain models is that they incur all of the costs of a domain
> model, without yielding any of the benefits."

Our contracts are Zod schemas shared with the client and must stay serialisable, so the
classical remedy — put behaviour on entities — is not available. The equivalent here is
**pure functions beside the contract**: `helpers.ts` in the module, or a shared module in
`platform/` when several modules need the same rule.

A 400-line service is not automatically wrong. A 400-line service in a module with no
`helpers.ts` almost always is — it means every rule inside it can only be tested through
a mock, and none of them can be reused.

```ts
// ❌ a rule that needs a whole service and a mocked repository to test
class ReviewService {
  async summarize(runId: string) {
    const findings = await this.repo.findingsFor(runId);
    let score = 100;
    for (const f of findings) score -= f.severity === 'critical' ? 25 : 5;
    return { score: Math.max(0, score), verdict: score < 50 ? 'request_changes' : 'comment' };
  }
}

// ✅ the rule is data-in/data-out; the service fetches and delegates
// helpers.ts
export function scoreFindings(findings: Finding[]): ReviewSummary { … }

// service.ts
async summarize(runId: string) {
  return scoreFindings(await this.repo.findingsFor(runId));
}
```

## When *not* to add a layer (MEDIUM)

Onion's documented failure mode is ceremony without payoff. Allegro, writing from
production, is explicit that it "is not a one-size-fits-all solution... is best suited
for services with a clear domain definition" [5], and lists the price: a learning curve
for newcomers and increased overall complexity [5].

Rentea is blunter about the specific shapes to avoid — "question any interface with a
single implementation, in the same module", and the middle-man smell of "indirection
without abstraction – it does not add any new semantic (abstraction) to the method to
which it delegates" [4]. On the cost of testing such code: "Testing such silly methods
with mocks would lead to 5x times larger test code than tested code" [4].

Concretely, **skip the layer** when:

- The endpoint is one query with no decision. A route reading one row, mapping it, and
  returning it does not need a service in between to prove it is well-architected.
  `modules/workspace/` is correctly service-less. Note what this does *not* excuse: the
  query itself still belongs to whichever repository owns the table — skipping the
  service ring is a judgement call, putting SQL in a route is a leak.
- The service method would only forward its arguments to one repository method with no
  transformation. That is the middle man [4] — call the repository from the route until
  a second caller or a rule appears.
- The interface would have exactly one implementation, no mock, and no cross-ring
  boundary to protect [4].

**Add the layer** the moment any of these appear: a second caller, a decision or a
sequence, an external call, a transaction, or a rule you want to test without a DB. The
work of adding it later is small precisely because the rings are shallow — moving four
queries into a `repository.ts` is a mechanical change. Adding it speculatively is what
you cannot undo cheaply, because by then things import it.

The distinction that keeps this honest: **a leak is never acceptable, a missing layer
often is.** A route with a query in it and no repository is debt with a known fix. A
service that imports Octokit directly has already spread the vendor's shape into the
core, and unwinding it means touching every caller.

## Jobs and background work (MEDIUM)

Asynchronous work is application-ring, not a fourth kind of thing. The handler is
registered by the service that owns the domain (`service.registerCloneJobHandler()`),
and the job payload is a plain serialisable object — an id and the few fields needed to
resume, never a live object or a request-scoped value.

The reason payloads stay minimal is that a job runs later, in a different process state:
anything captured at enqueue time may be stale by the time it executes. Pass the id and
re-read.

Enqueue rather than call when the work is slow, retryable, or must not block a response.
The route stays a route — it returns immediately — and the ring boundaries are unchanged
because the job runner is reached through the container like any other collaborator.
