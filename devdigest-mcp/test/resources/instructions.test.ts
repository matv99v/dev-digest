/**
 * R11 — the `instructions` string stays one short line.
 *
 * These two cases guard a token budget, not a behaviour, which is why they look
 * so blunt. `instructions` is not deferred by tool search: it is billed under
 * `# MCP Server Instructions` on every turn of every session this server is
 * connected to, called or not, and truncated at a threshold nobody here has been
 * able to establish. The failure mode is silent — a paragraph that grew one
 * sentence at a time costs on every turn forever, and past the cut-off the tail
 * simply disappears without an error.
 *
 * So: no newline (a multi-line string is a paragraph wearing a sentence's
 * clothes) and under 200 characters, well inside any plausible cut-off. The
 * third case is the one that keeps the sentence useful — the call order is the
 * single thing the tool list cannot convey, so all three tool names must be in
 * it. Reference prose belongs in `src/resources/index.ts`, where it is free.
 */
import { describe, expect, it } from 'vitest';
import { instructions } from '../../src/instructions';

describe('instructions (R11)', () => {
  it('is a single line under 200 characters', () => {
    expect(instructions).not.toContain('\n');
    expect(instructions.length).toBeLessThan(200);
  });

  it('names the call order: list_agents → run_agent_on_pr → get_findings', () => {
    expect(instructions).toContain('list_agents');
    expect(instructions).toContain('run_agent_on_pr');
    expect(instructions).toContain('get_findings');

    // Order, not just presence — the sentence exists to convey the sequence.
    expect(instructions.indexOf('list_agents')).toBeLessThan(
      instructions.indexOf('run_agent_on_pr'),
    );
    expect(instructions.indexOf('run_agent_on_pr')).toBeLessThan(
      instructions.indexOf('get_findings'),
    );
  });
});
