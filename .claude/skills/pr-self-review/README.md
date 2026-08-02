# References

Sources behind every rule in this skill. Each was fetched and read on **2026-08-02**, not
cited from a search summary — the claims below are what the page actually says.

Rules in the other files cite these by number, e.g. `finding 2`. A rule with no number is a
judgement call this skill is making on its own, and says so.

---

## Why the gate is designed the way it is

### [1] BDigital — Diagnosing False Positives in AI Code Review
<https://tech.bdigitalmedia.io/blog/diagnosing-ai-review-false-positives/>

The single most useful source here. An audit of a production AI reviewer, measuring how
developer behaviour changes with the false-positive rate:

| FP rate | Behaviour |
|---|---|
| 0–10% | "developers treated every finding as real and investigated it" |
| 10–30% | investigated most, but started labelling the tool "noisy" in retros |
| 30–50% | "triaged with suspicion" |
| >50% | "dismiss by default, and a finding only got read **if it blocked a merge**" |

That last row is why [gate.md](./gate.md) keeps CRITICAL enumerated and small: the blocking
channel is the last one that survives noise, so every rule added to it spends a budget that
cannot be topped up.

### [2] The same audit — taxonomy of false-positive causes

Three failure modes, with shares:

- **~40% — exclusion-list failures.** The model fails to apply *its own* suppression rules,
  particularly to test infrastructure and configuration files, despite explicit instructions.
- **~30–42% — configuration-as-production.** Environment config, infrastructure-as-code, and
  developer tooling reviewed as if they were production application code.
- **~15% — hallucinated evidence.** Fabricated commit hashes, inflated metrics, references to
  code that does not exist.

This is why the exclusion list in [gate.md](./gate.md#exclusions) is the highest-leverage
part of the skill and is applied **twice** — once when routing, once when consolidating — and
why grounding every finding to a real `file:line` is mandatory rather than advisory. The
first two categories also explain the Tests bucket: test files are reviewed by test-aware
rules instead of being either ignored or judged as production code.

Supporting scale, same problem: up to 40% of AI review alerts get ignored, and untuned LLM
reviewers run at 40–80% false positives against SonarSource's 3.2% after years of rule
tuning —
[cubic](https://www.cubic.dev/blog/the-false-positive-problem-why-most-ai-code-reviewers-fail-and-how-cubic-solved-it),
[State of AI Code Review Tools 2025](https://www.devtoolsacademy.com/blog/state-of-ai-code-review-tools-2025).

### [3] SonarSource — Clean as You Code
<https://docs.sonarsource.com/sonarqube-server/9.9/user-guide/clean-as-you-code> ·
<https://docs.sonarsource.com/sonarqube-server/user-guide/about-new-code>

Why quality gates should judge only changed lines:

> "By focusing on new code, you aren't responsible for anyone else's code. You own the
> quality and security of the code you are working on today."

> "adding more conditions may lead to bottlenecks in the pace of development with minimal
> benefit. You also run the risk of an **ignored quality gate** because frequent failures may
> cause a debate on which conditions to prioritize."

Backs the added/modified-lines-only rule in [gate.md](./gate.md#clean-as-you-code). It is
what lets this skill ship before the seven known `onion-architecture` deviations are paid
down: they are simply not in scope unless you touch those lines.

### [4] Augment Code — Deep Code Review: Why Recall Beats Precision for Agents
<https://www.augmentcode.com/guides/deep-code-review-recall-vs-precision>

The counterweight to [1] and [2], and the reason the fan-out is structured as it is.
Precision-first tuning, it argues, "leaves file-level review exposed to bugs that span
services, permissions, and workflows" — exactly the architectural and cross-boundary defects
this repo's skills exist to catch. Its principle:

> filter at the presentation layer, not the detection layer

So subagents are told to report broadly and the orchestrator filters
([SKILL.md](./SKILL.md) steps 3–4). Telling subagents to be conservative would suppress the
findings the skill is for — and would be redundant, since consolidation filters anyway.

---

## Formats and vocabulary adopted rather than invented

### [5] SARIF 2.1.0 (OASIS) and GitHub code scanning
<https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html> ·
<https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning>

SARIF is the interchange format for normalizing findings across multiple analysis tools —
the same problem this skill has, since each source skill uses its own scale. GitHub's docs
confirm the vocabulary:

> "The valid values for `defaultConfiguration.level` are: `note`, `warning` and `error`."

Security findings carry a separate numeric `security-severity` (over 9.0 `critical`, 7.0–8.9
`high`, 4.0–6.9 `medium`, 0.1–3.9 `low`). The common mapping from richer scales is
critical/high → `error`, medium → `warning`, low/info → `note`
([Sonar's SARIF guide](https://www.sonarsource.com/resources/library/sarif/)).

Three levels is therefore a validated choice rather than a compromise, and the finding
contract in [routing.md](./routing.md) borrows SARIF's field names (`level`, `ruleId`,
`message`) so emitting real SARIF later is a formatting step, not a redesign.

### [6] Danger JS — Fast Feedback via Danger Local
<https://danger.systems/js/tutorials/fast-feedback> · <https://danger.systems/js/>

The closest prior art: rules evaluated against a local diff, run from a pre-push hook, with
`fail()` producing a non-zero exit. It also names the trap this skill guards against:

> "Where `danger ci` uses information from the Pull Request to figure out what has changed,
> `danger local` **naively uses the local differences in git from master to the current
> commit**… if you don't keep your master branch sync, then it will be checking across
> potentially many branches."

Hence `git fetch origin main` before computing the base, and an explicit warning when it
fails ([enforcement.md](./enforcement.md#the-stale-base-problem)). Danger's other useful
idea — a *lite* ruleset for the local run, distinct from the full CI run — is what the
bucket routing achieves here by a different route.

### [7] Multi-agent orchestration for code review
<https://github.com/calimero-network/ai-code-reviewer> ·
<https://www.augmentcode.com/guides/multi-agent-orchestration-architecture-guide>

Orchestrator-plus-specialists is established practice: agents run in parallel with distinct
focus areas, the orchestrator loads the diff once, fans it out, and merges. The detail worth
stealing is that **findings confirmed by more than one agent are a stronger signal** — hence
`agreedBy` in the finding contract, recorded during dedupe.

### [8] Conventional Comments
<https://conventionalcomments.org/>

A standard vocabulary for review feedback, so the report reads like human review comments
rather than tool output. Labels: `praise`, `nitpick`, `suggestion`, `issue`, `todo`,
`question`, `thought`, `chore`, `note`. Decorations:

> **(blocking):** "should prevent the subject under review from being accepted, until it is
> resolved."
>
> **(non-blocking):** "should not prevent the subject under review from being accepted."

Note the vocabulary is deliberately used only for *presentation*. What actually blocks is
`level: CRITICAL` per [gate.md](./gate.md) — the label follows the level, never the reverse.

---

## Where the sources disagree

### Recall or precision?

[1] and [2] measure the cost of noise and push toward aggressive filtering. [4] argues the
opposite: for agent-first review, "false positives become cheaper while post-release defects
still cost dramatically more than earlier detection," and precision-first tuning blinds you
to cross-boundary bugs.

**Position taken:** both, at different stages. Detection is high-recall (subagents report
everything they can ground); presentation is high-precision (the orchestrator dedupes,
re-applies exclusions, drops ungrounded findings, and blocks on an enumerated CRITICAL set).
The fan-out already has two stages, so this costs nothing structurally. Collapsing them —
telling subagents to self-censor — would sacrifice [4]'s coverage without gaining anything
[1] and [2] ask for.

### Should a gate block at all?

[3] warns that frequent failures produce an ignored gate. [1] finds that once noise is high
enough, blocking is the *only* channel developers still read.

**Position taken:** block, but on a set small enough that blocking stays rare and meaningful,
and scoped to changed lines so the failure is always about code the author just wrote. A gate
that fires on someone else's legacy debt is the exact "debate about which conditions to
prioritize" [3] describes.

---

## Considered and excluded

- **cubic's false-positive post** — cited above for the industry-level 40%-ignored figure, but
  it contains no before/after metrics for its own product, so nothing here rests on its
  architectural claims.
- **Reviewdog, pre-commit, lefthook** — general hook runners. The gate here needs a marker
  written by an agent rather than a command that can run standalone, so they solve a
  different problem.
