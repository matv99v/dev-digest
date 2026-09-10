/**
 * R10 — every API failure carries a named next action.
 *
 * Four cases, one per failure the plan names. Each asserts the *substring an
 * agent would act on*, not the whole sentence: the wording is free to improve,
 * the actionable token is not.
 *
 * Two of the four (429, 500) deliberately carry the code `internal_error`,
 * which is what the API's catch-all handler attaches (`server/src/app.ts:162`).
 * They are the reason `errors.ts` resolves generic codes by **status** — a code
 * lookup that matched `internal_error` first would answer a rate-limit with the
 * database advice.
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/errors';

describe('ApiError → next action (R10)', () => {
  it('names `agent_id` for invalid_run_request', () => {
    const err = new ApiError(400, 'invalid_run_request', 'Provide agentId or all:true');
    expect(err.message).toContain('agent_id');
    expect(err.status).toBe(400);
    expect(err.code).toBe('invalid_run_request');
  });

  it('points a 404 at `list_agents`', () => {
    const err = new ApiError(404, 'not_found', 'Agent not found');
    expect(err.message).toContain('list_agents');
    expect(err.status).toBe(404);
  });

  it('names the `10/min` cap for a 429', () => {
    const err = new ApiError(429, 'internal_error', 'Rate limit exceeded, retry in 1 minute');
    expect(err.message).toContain('10/min');
  });

  it('names `db:seed` for a 500', () => {
    const err = new ApiError(500, 'internal_error', 'Internal error');
    expect(err.message).toContain('db:seed');
  });
});
