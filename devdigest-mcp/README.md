# `@devdigest/mcp` — DevDigest over MCP

A local stdio MCP server exposing DevDigest's review engine to Claude Code as five tools.
It is a thin HTTP client over the DevDigest API at `http://localhost:3001` — it holds no
business logic, never imports the server's `Container`, and never touches the database.

Status: **complete** — all five tools are registered and wired
(`docs/plans/06-devdigest-mcp-server.md`).

## Tools

| Tool | Parameters | Returns |
|---|---|---|
| `list_agents` | `enabled_only` (bool, default `false`) | The configured reviewer agents: `id`, `name`, `description`, `provider`, `model`, `enabled`, `strategy`, `ci_fail_on`. **Never `system_prompt`**, on any path. |
| `run_agent_on_pr` | `pr` (uuid or `owner/repo#N`), `agent_id`, `all_agents` (bool), `timeout_s` (default `600`, max `1800`) | Starts a review and **waits for it**, polling until every started run is terminal and emitting one progress notification per poll. Returns the verdict, score and concise findings. On `timeout_s` it returns the `run_ids` and tells you to call `get_findings` later — it never throws, and the review keeps running server-side. Pass exactly one of `agent_id` / `all_agents`. |
| `get_findings` | `pr` (uuid or `owner/repo#N`), `run_id`, `severity` (`CRITICAL`/`WARNING`/`SUGGESTION`), `limit` (default `20`, max `100`), `offset` (default `0`), `detail` (`concise`/`full`) | The reviews on a PR with per-severity counts. `concise` drops `rationale` and `suggestion` (the two markdown size drivers); `full` adds them back. `severity` chooses *which* findings, `offset`/`limit` choose *which window* — independent axes, and the total is stated so a second call can page. |
| `get_conventions` | `repo` (uuid or `owner/repo`), `status` (`pending`/`accepted`/`rejected`), `limit` (default `50`, max `200`), `detail` | The repo's extracted convention candidates with their evidence. `concise` omits each evidence snippet but keeps its path and line range. No status filter by default — extraction leaves rows `pending` until a human triages them. |
| `get_blast_radius` | `repo` (uuid or `owner/repo`), `files` (string array) | **A stub.** Returns the wire shape `{changed_symbols, downstream, summary}` with empty arrays and a summary stating the analysis is *not implemented* — which is not the same as *no impact found*. It exists so the later implementation is a mapper plus a route rather than a contract change. |

**A PR is `owner/repo#N` or a uuid; a repo is `owner/repo` or a uuid.** None of the five
tools returns a PR id, so the human form is the only entry point — and resolving it calls
the API's pulls route, which **syncs from GitHub and backfills up to 10 PRs** for that repo.
Passing a uuid short-circuits the resolver and avoids that side effect.

Three reference documents are exposed as MCP **resources**, not as prose in the server's
`instructions` (which is billed every turn): `devdigest://score-rubric`,
`devdigest://severity-vocabulary`, `devdigest://blast-radius`.

## Protocol era

**Observed `2026-09-08`: `legacy` — the negotiated revision is `2025-11-25`, and the
`io.modelcontextprotocol/protocolVersion` `_meta` key is `absent`.**

This is T2's required observation (R1). It was taken by running the probe through the
package's own harness, with no Claude Code session involved:

```
cd devdigest-mcp && node scripts/call.mjs probe/probe.ts probe_era
```

Transcript, verbatim:

```
[harness] negotiated protocolVersion: 2025-11-25
[probe_era] {"observed_protocol_version":"absent","read_from":"neither _meta nor envelope",
"meta_key":"io.modelcontextprotocol/protocolVersion","raw_meta":null,"raw_envelope":null,
"sdk_latest_protocol_version":"2025-11-25","sdk_default_negotiated_protocol_version":"2025-03-26",
"sdk_supported_protocol_versions":["2025-11-25","2025-06-18","2025-03-26","2024-11-05","2024-10-07"]}
```

### What this settles, and how firmly

The plan carried this as its one blocking unknown: the `@modelcontextprotocol/server@2.0.0`
README says the package "implements the 2026-07-28 MCP spec", while the v2 migration guide
says the parties "settle on the newest revision both packages support (currently
`2025-11-25`)". **The migration guide is right.** The installed package's own
`SUPPORTED_PROTOCOL_VERSIONS` is

```
["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"]
```

— `2026-07-28` is not in it, and `LATEST_PROTOCOL_VERSION` is `2025-11-25`.

That constant is a property of the **server package**, not of whichever client happens to
connect, which makes this stronger evidence than a single client test: even against a client
that offers `2026-07-28`, this server cannot accept it. The absent `_meta` key is the
consequence, not a separate finding — the per-request `_meta` envelope
(`io.modelcontextprotocol/protocolVersion`, `…/clientCapabilities`) is a `2026-07-28`
construct, so on a `2025-11-25` connection there is nothing to read.

Two things this does **not** establish, deliberately left open rather than assumed:

- **That Claude Code itself connects.** The harness is not Claude Code; it advertises
  `2025-11-25` and runs the classic `initialize` handshake. Claude Code 2.1.263 probes
  `server/discover` first and falls back when a server gives "no modern evidence", which is
  exactly this server's case — but the confirmation is T14's live check, not this one.
- **Anything about `@modelcontextprotocol/sdk@^1`.** It was not installed or measured here.

### What it changes in the plan

**Nothing structural** — which is the point of the paragraph after T2. Three era-dependent
affordances are not relied on anywhere, and now cannot be:

| Affordance | Status |
|---|---|
| Deterministic `tools/list` ordering (2026-07-28 minor §3) | unavailable; `src/server.ts` registers in a fixed source order anyway, so behaviour is unchanged |
| `ttlMs` / `cacheScope` result caching (`CacheableResult`) | unavailable; no tool declares them |
| `io.modelcontextprotocol/tasks` extension | unavailable; `run_agent_on_pr` polls, as *Not planned* already specified |

One decision it *does* inform: v2 and v1 now serve the **same** protocol ceiling
(`2025-11-25`). v2's remaining advantages over the v1 monolith are its API surface —
`z.object(...)` schemas, clean subpath exports, `serveStdio` — not protocol reach. T1's named
fallback to `@modelcontextprotocol/sdk@^1` + zod 3 therefore costs nothing in capability if it
is ever taken.

### A finding the probe returned that the plan did not anticipate

In v2 a tool handler's second argument is `ctx`, and the reserved `io.modelcontextprotocol/*`
keys are lifted out of the `_meta` a handler sees into `ctx.mcpReq.envelope` — they are not
readable as `_meta[PROTOCOL_VERSION_META_KEY]`. `probe/probe.ts` reads both locations for that
reason. Any later task that expects request `_meta` to carry protocol-level keys should read
`ctx.mcpReq.envelope` instead.

## Layout

```
src/server.ts       composition root — five registerTool calls, then serveStdio
src/tools/          one file per tool; none imports another
src/api/            the single fetch chokepoint, error mapping, ref resolution, local types
src/log.ts          the only sanctioned output path — stderr, never stdout
scripts/call.mjs    one-shot stdio harness: spawn a server, call one tool, print, exit.
probe/probe.ts      Phase-0 diagnostic — answers the question above. Temporary.
test/               hermetic vitest suite; every test stubs fetch
```

## Commands

```sh
npm ci                 # npm, never pnpm — matches reviewer-core/ and e2e/
npm run typecheck      # tsc --noEmit
npm test               # vitest run
npm run call -- <entry> <tool> '<json args>'
```

The harness needs no Claude Code session and no MCP Inspector:

```sh
node scripts/call.mjs probe/probe.ts probe_era
npm run call -- src/server.ts list_agents '{}'     # once Phase 2 lands
```

`MCP_PROTOCOL_VERSION` overrides the revision the harness advertises;
`MCP_CALL_TIMEOUT_MS` bounds the whole run (default 120000).

## Registering with Claude Code — automatic

**The root `.mcp.json` is committed** and registers this server. Opening Claude Code at the
repo root (or a subdirectory of it) connects `devdigest` with no hand-wiring:

```json
{
  "mcpServers": {
    "devdigest": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "devdigest-mcp/src/server.ts"],
      "env": {
        "DEVDIGEST_API_BASE": "http://localhost:3001",
        "MCP_TOOL_TIMEOUT": "660000"
      }
    }
  }
}
```

Confirm with `claude mcp list` or `/mcp` — `devdigest` should show connected with five
tools. `scripts/dev.sh` / `scripts/e2e.sh` still never touch this package or start it —
only the API it talks to; the API must be running separately (see below).

**For a single tool call with no MCP registration at all** — fastest for a one-off check,
and what the harness is for:

```sh
cd devdigest-mcp
npm run call -- src/server.ts list_agents '{}'
npm run call -- src/server.ts get_findings '{"pr":"owner/repo#42"}'
```

**To register under a different name, or from outside this repo**, `claude mcp add` still
works and takes precedence over `.mcp.json` for that session:

```sh
claude mcp add devdigest-alt \
  --env DEVDIGEST_API_BASE=http://localhost:3001 \
  --env MCP_TOOL_TIMEOUT=660000 \
  -- npx tsx /absolute/path/to/dev-digest/devdigest-mcp/src/server.ts
```

`claude mcp remove <name>` undoes an ad-hoc `add`; it does not touch the committed
`.mcp.json` entry, which is scoped to the `devdigest` name inside this repo.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `DEVDIGEST_API_BASE` | `http://localhost:3001` | the DevDigest API. No auth header is sent — `LocalNoAuthProvider` ignores the request entirely |
| `MCP_TOOL_TIMEOUT` | `660000`, set in the committed root `.mcp.json` | the **client-side** deadline for one tool call, in ms. Read by Claude Code, not by this server |

**`MCP_TOOL_TIMEOUT` and `run_agent_on_pr`'s `timeout_s` move together.** The committed
660000 ms is `timeout_s`'s 600 s default plus a 60 s margin, so the tool always reaches its
own cut-off first and returns the `run_ids` — a recoverable result — instead of being cut
off by the client. A progress notification resets the 30-minute stdio idle window but does
**not** extend that wall clock. **Raising `timeout_s` toward its 1800 s cap without raising
`MCP_TOOL_TIMEOUT` in `.mcp.json` puts you back on the wrong side of that race** — edit the
committed file's `env.MCP_TOOL_TIMEOUT` and restart the session (or reconnect with
`claude mcp list` / `/mcp`) for it to take effect.

The API **must be running** (`./scripts/dev.sh`, seeded) before any tool call succeeds. An
unseeded database surfaces as a **500**, not a 401.

## Rules that are not style

- **stdout is the JSON-RPC channel.** All logging goes through `src/log.ts` (stderr). Nothing
  under `src/` or `scripts/` may call `console.log` — a stray write corrupts the protocol with
  no error and no clue. CI greps for it.
- **No `paths` alias into `@devdigest/shared`, ever.** This package is on zod 4 while
  `reviewer-core` is on zod 3; they never meet only because no alias exists. It declares its own
  narrow local types instead.
