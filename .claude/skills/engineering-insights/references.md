# References

Where this skill's design came from. Not needed to use it — [SKILL.md](SKILL.md)
is self-contained.

## The learnings-loop pattern

- [Self-learning AI skill system with Learnings.md + wrap-up](https://www.mindstudio.ai/blog/self-learning-ai-skill-system-learnings-md-wrap-up)
  — the seven fixed sections, the vague-vs-useful bar, the ~200-entry point where
  signal-to-noise collapses, and the observation that skipping *What Doesn't Work*
  is the most common and most costly mistake.
- [How to build a learnings loop](https://www.mindstudio.ai/blog/how-to-build-learnings-loop-claude-code-skills)
  — append-only, and correcting an entry with a dated note rather than a rewrite.
- [Self-learning skill with Learnings.md](https://www.mindstudio.ai/blog/self-learning-claude-code-skill-learnings-md)
  — why plain markdown in the repo beats a retrieval system: *"just a file that the
  previous version of Claude left notes in for the current version to read."*
- [Self-evolving memory with Obsidian + hooks](https://www.mindstudio.ai/blog/self-evolving-claude-code-memory-obsidian-hooks)
  — the Patterns / Mistakes / Decisions / Context split behind the section list.
- [What is auto-memory](https://www.mindstudio.ai/blog/what-is-claude-code-auto-memory)
  — gate tests 4 and 5 (durable not volatile, project-specific not general), and
  the reason to review early entries: a wrong one propagates into every later
  session until someone corrects it.
- [Context compounding](https://www.mindstudio.ai/blog/claude-code-context-compounding-explained)
  — why the file is split per module rather than kept as one.

## Skill authoring

- [Anthropic — Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
  — third-person description covering *what* and *when*; body under 500 lines;
  references one level deep; a table of contents on reference files over 100 lines.
- [Anthropic — Lessons from building Claude Code: how we use skills](https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills)
  — a skill is a folder, not a markdown file; descriptions are written for the
  model, not for humans.

## Prior implementations

- [glebis/claude-skills — `retrospective/SKILL.md`](https://github.com/glebis/claude-skills)
  — read the target file before writing, dedupe against existing content, and
  never record learnings into the skill's own files.
- [accidentalrebel/claude-skill-session-retrospective](https://github.com/accidentalrebel/claude-skill-session-retrospective)
  — be specific: real error strings and paths, and frame lessons so they transfer
  beyond the session that produced them.

## Self-improving instruction files

- [Self-improving AI: one prompt that makes Claude learn from every mistake](https://dev.to/aviad_rozenhek_cba37e0660/self-improving-ai-one-prompt-that-makes-claude-learn-from-every-mistake-16ek)
  — NEVER/ALWAYS phrasing, lead with why, and the anti-bloat rules.
- [CLAUDE.md: building persistent memory for AI coding agents](https://dev.to/evoleinik/claudemd-building-persistent-memory-for-ai-coding-agents-5322)
  — *"only add if genuinely useful"*, periodic pruning, and the limits of the
  approach: it is not a documentation replacement, and not a substitute for fixing
  tooling that is actually broken.

## Why this skill is not a hook

Skills are invoked by the model's judgment; hooks are fired by the system on a
lifecycle event. See
[skills vs hooks](https://www.mindstudio.ai/blog/claude-code-skills-vs-hooks-difference)
and [the compounding knowledge loop](https://www.mindstudio.ai/blog/compounding-knowledge-loop-claude-code).

That makes this skill's capture **best-effort**: it fires when the model notices
something, which is not every time. A `Stop` hook would make capture
unconditional. Deliberately out of scope — the gap is the point, and closing it
comes later.

Related: [scripts vs markdown instructions](https://www.mindstudio.ai/blog/claude-code-skills-code-scripts-vs-markdown-instructions)
argues module routing would be more reliable as a script than as a table. Kept as
a table here for legibility; worth revisiting if routing proves error-prone.
