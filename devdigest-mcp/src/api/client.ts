/**
 * The single `fetch` chokepoint. Every HTTP call this package makes goes
 * through `apiGet` / `apiPost`, and no other file imports `fetch`.
 *
 * That is what makes the rest testable: every test in this package stubs one
 * global (`vi.stubGlobal('fetch', ...)`) and needs no API, no database, no
 * network and no model key.
 *
 * **No `Authorization` header, on purpose.** The API's auth provider for local
 * use ignores the request entirely, so a token here would be dead weight that
 * reads like a security control. If the API ever grows real auth this file is
 * the one place that changes — and the workspace-selection question it opens is
 * explicitly out of scope (see *Not planned* in the plan).
 */
import { log } from '../log';
import { ApiError, parseErrorEnvelope } from './errors';

/** The API `./scripts/dev.sh` starts. */
export const DEFAULT_API_BASE = 'http://localhost:3001';

/**
 * Bounds a single request so a hung API cannot hold a tool call open until the
 * MCP client's own wall clock kills it — a tool that returns "the API did not
 * answer in 30s" is worth more than one that is cut off with no result. The
 * poll loop calls this many times; each attempt gets its own budget.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Read per call rather than once at module load: the value is process
 * environment, tests change it between cases, and nothing here is hot enough
 * for the read to matter.
 */
export function apiBase(): string {
  const raw = process.env.DEVDIGEST_API_BASE?.trim();
  return (raw && raw.length > 0 ? raw : DEFAULT_API_BASE).replace(/\/+$/, '');
}

function timeoutMs(): number {
  const raw = Number(process.env.DEVDIGEST_API_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function urlFor(path: string): string {
  return `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const url = urlFor(path);
  log.info(`${method} ${url}`);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      // No `Authorization` — see the file header.
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch (cause) {
    // No response at all: connection refused, DNS, or the timeout above. There
    // is no status and no envelope, so the status is 0 and the code is this
    // package's own — `errors.ts` maps it to "is the API running?".
    const detail = cause instanceof Error ? cause.message : String(cause);
    log.error(`${method} ${url} failed before any response: ${detail}`);
    throw new ApiError(0, 'network_error', `${method} ${url} — ${detail}`, cause);
  }

  const text = await res.text();

  if (!res.ok) {
    const { code, message, details } = parseErrorEnvelope(res.status, text);
    log.warn(`${method} ${url} → ${res.status} ${code}: ${message}`);
    throw new ApiError(res.status, code, message, details);
  }

  // 204, or a route that answers with an empty body. Callers that expect
  // nothing type `T` as `void`; callers that expect JSON would fail on the
  // parse below anyway, so an empty success is not silently turned into `{}`.
  if (text.trim().length === 0) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      res.status,
      'invalid_response',
      `${method} ${url} returned ${res.status} with a body that is not JSON`,
      text.slice(0, 500),
    );
  }
}

/** GET `path` and parse the JSON body. Throws `ApiError` on any non-2xx. */
export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

/** POST `body` (JSON) to `path` and parse the JSON body. Throws `ApiError` on
 *  any non-2xx.
 *
 *  Exactly one route is ever POSTed to — `POST /pulls/:id/review` — and it is
 *  capped at 10/min (`server/src/modules/reviews/routes.ts:29`). A caller that
 *  wants to know whether a review has finished polls `GET /pulls/:id/runs`; it
 *  never re-POSTs. */
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body ?? {});
}
