/**
 * The HTTP chokepoint, and R15's stdout guard.
 *
 * Every case here stubs one global. Nothing in this file reaches an API, a
 * database or a network — that is the property `src/api/client.ts` exists to
 * make possible for every later test in the package.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiBase, apiGet, apiPost, DEFAULT_API_BASE } from '../../src/api/client';
import { ApiError } from '../../src/api/errors';
import { log } from '../../src/log';

/** The client logs every request through `log` (stderr). Silence it so a test
 *  run reads as a test run — except in the R15 case, which spies deliberately. */
function silenceStderr(): void {
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const savedBase = process.env.DEVDIGEST_API_BASE;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (savedBase === undefined) delete process.env.DEVDIGEST_API_BASE;
  else process.env.DEVDIGEST_API_BASE = savedBase;
});

describe('log (R15 — stdout is the JSON-RPC channel)', () => {
  it('writes through console.error and never console.log', () => {
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    log.info('x');

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain('x');

    log.warn('y');
    log.error('z');
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(3);
  });
});

describe('apiBase', () => {
  beforeEach(silenceStderr);

  it('defaults to the API ./scripts/dev.sh starts', () => {
    delete process.env.DEVDIGEST_API_BASE;
    expect(apiBase()).toBe(DEFAULT_API_BASE);
  });

  it('honours DEVDIGEST_API_BASE and strips its trailing slash', () => {
    process.env.DEVDIGEST_API_BASE = 'http://127.0.0.1:4001/';
    expect(apiBase()).toBe('http://127.0.0.1:4001');
  });
});

describe('apiGet / apiPost', () => {
  beforeEach(silenceStderr);

  it('GETs the default base and parses the body', async () => {
    delete process.env.DEVDIGEST_API_BASE;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse([{ id: 'a1' }]),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet<Array<{ id: string }>>('/agents')).resolves.toEqual([{ id: 'a1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3001/agents');
  });

  it('sends no Authorization header', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ ok: true }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiPost('/pulls/p1/review', { all: true });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const names = Object.keys(headers).map((k) => k.toLowerCase());
    expect(names).not.toContain('authorization');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ all: true }));
  });

  it('throws ApiError carrying the envelope status and code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: { code: 'invalid_run_request', message: 'Provide agentId' } }, 400),
      ),
    );

    const err = await apiPost('/pulls/p1/review').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).code).toBe('invalid_run_request');
    expect((err as ApiError).message).toContain('agent_id');
  });

  it('turns an unreachable API into a network_error, not a crash', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:3001');
      }),
    );

    const err = await apiGet('/agents').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('network_error');
    expect((err as ApiError).message).toContain('./scripts/dev.sh');
  });
});
