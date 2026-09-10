/**
 * API failures → text an agent can act on (R10).
 *
 * A tool result that says "Request failed with status 500" tells the model
 * nothing it can do next, so it retries the same call. Every non-2xx response
 * from the DevDigest API is therefore turned into a line that names the failure
 * **and one concrete next action** — the tool to call, the flag to pass, or the
 * command to run.
 *
 * The API's error envelope is `{ error: { code, message, details? } }`
 * (`server/src/vendor/shared/contracts/platform.ts:274-280`, produced by the
 * handler at `server/src/app.ts:115-163`).
 *
 * Two lookups, in this order and for a reason:
 *  1. `code`, but only for codes that identify a *specific* failure. Generic
 *     codes are not listed here.
 *  2. `status`, which is what catches the generic ones. `internal_error` is the
 *     handler's catch-all (`app.ts:162`) and is attached to whatever status the
 *     thrown error carried — a rate-limit rejection reaches it as a 429 with
 *     that same generic code. Matching on the code first would then answer a
 *     429 with the database advice, which is why `internal_error` is
 *     deliberately absent from the code table.
 */

/** The envelope shape, declared locally — see the header of `types.ts` on why
 *  nothing here imports `@devdigest/shared`. */
export interface ApiErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

/** Codes that identify one specific failure. Generic codes belong in
 *  `BY_STATUS` instead; see the header. */
const BY_CODE: Record<string, string> = {
  invalid_run_request:
    'pass `agent_id` (get a valid one from the `list_agents` tool) or `all_agents: true` — ' +
    'the review route needs exactly one of them.',
  not_found:
    'the id was not found in this workspace — call `list_agents` for a valid agent id, or pass ' +
    'a PR as `owner/repo#N` and a repo as `owner/repo` so it is resolved for you.',
  validation_error:
    'the request did not validate — a uuid parameter is not a uuid, or a value is outside the ' +
    "tool's schema. Re-read the tool's parameters and retry once.",
  external_service_error:
    'an upstream service (GitHub or the model provider) failed, not DevDigest itself — retry ' +
    'once, then check the tokens in the DevDigest settings page.',
  config_error:
    'the API is missing configuration (most often a provider API key) — set it in the DevDigest ' +
    'settings page before retrying.',
  /** Not a server code: `client.ts` uses it when a 2xx body will not parse as
   *  JSON — almost always a proxy or a wrong `DEVDIGEST_API_BASE` answering
   *  instead of the API. */
  invalid_response:
    'the response was not JSON — `DEVDIGEST_API_BASE` is probably pointing at something other ' +
    'than the DevDigest API (a dev server or a proxy). Check it before retrying.',
  /** Not a server code: `client.ts` uses it when `fetch` itself rejects, so
   *  there is no response and no envelope at all. */
  network_error:
    'no HTTP response at all — the DevDigest API is probably not running. Start it with ' +
    '`./scripts/dev.sh` from the repo root, or point `DEVDIGEST_API_BASE` at a running one.',
};

const BY_STATUS: Record<number, string> = {
  400: 'the request was rejected as malformed — re-read the tool schema and retry once.',
  401: 'the API rejected the request as unauthenticated, which the local API never does — check ' +
    '`DEVDIGEST_API_BASE` is not pointing at a different deployment.',
  404: 'not found — call `list_agents` for a valid agent id, and pass PRs as `owner/repo#N` ' +
    'rather than guessing a uuid.',
  422: 'the request did not validate — check every id is a uuid and every value matches the ' +
    "tool's schema.",
  429: 'rate limited: the review route is capped at 10/min and the API at 120/min. Wait and ' +
    'retry — do NOT re-POST a review that is already running; poll it with `get_findings`.',
  500: 'the API is up but the database may be unseeded — run `pnpm db:seed` in `server/`, then ' +
    'retry. If it persists, read the API log; the fault is server-side, not in the arguments.',
  502: 'an upstream service failed (GitHub or the model provider) — retry once before concluding ' +
    'anything about DevDigest.',
  503: 'the API is up but its database is unreachable — check Postgres is running ' +
    '(`./scripts/dev.sh --db-only`).',
};

/** The next action for a failure, chosen by code then by status. Always returns
 *  something: a message with no action is the failure mode this exists to fix. */
export function nextActionFor(status: number, code: string): string {
  return (
    BY_CODE[code] ??
    BY_STATUS[status] ??
    'no specific recovery is known for this status — report it with the status and code above ' +
      'rather than retrying blindly.'
  );
}

/**
 * A non-2xx (or unreachable) DevDigest API response.
 *
 * `message` is built to be *the* tool-visible text: a tool that does nothing
 * more than surface `err.message` still tells the model what failed and what to
 * do next. `status` and `code` stay available for tools that branch on them —
 * `run_agent_on_pr` does, to tell a 404 on the PR from a 404 on the agent.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** The API's own `error.message`, unmodified — `message` wraps it. */
  readonly apiMessage: string;
  readonly nextAction: string;
  readonly details?: unknown;

  constructor(status: number, code: string, apiMessage: string, details?: unknown) {
    const nextAction = nextActionFor(status, code);
    super(`DevDigest API ${status} ${code}: ${apiMessage}\nNext: ${nextAction}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.apiMessage = apiMessage;
    this.nextAction = nextAction;
    this.details = details;
  }
}

/**
 * Pull `{ code, message, details }` out of a response body.
 *
 * Defensive by construction: an error body is the one payload most likely to be
 * something other than the documented envelope — a proxy's HTML, a plugin's own
 * `{ statusCode, error, message }`, or an empty body. None of those may cost the
 * caller the status it already knows, so anything unrecognised degrades to the
 * generic code and keeps whatever text arrived.
 */
export function parseErrorEnvelope(
  status: number,
  body: string,
): { code: string; message: string; details?: unknown } {
  const fallback = { code: 'internal_error', message: body.trim() || `HTTP ${status}` };
  if (!body.trim()) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return fallback;
  }
  if (typeof parsed !== 'object' || parsed === null) return fallback;

  const envelope = (parsed as Partial<ApiErrorEnvelope>).error;
  if (typeof envelope === 'object' && envelope !== null && typeof envelope.code === 'string') {
    return {
      code: envelope.code,
      message: typeof envelope.message === 'string' ? envelope.message : `HTTP ${status}`,
      details: envelope.details,
    };
  }

  // Fastify plugins that answer before the app's error handler (the rate
  // limiter among them) send `{ statusCode, error, message }` with no `code`.
  const loose = parsed as { message?: unknown; error?: unknown };
  if (typeof loose.message === 'string') return { code: fallback.code, message: loose.message };
  if (typeof loose.error === 'string') return { code: fallback.code, message: loose.error };
  return fallback;
}
