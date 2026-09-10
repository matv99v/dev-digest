# devdigest-mcp — `@devdigest/mcp`

A stdio MCP server exposing DevDigest review to Claude Code as five tools. A thin HTTP
client over the API at `http://localhost:3001` — no business logic, no database, no
`Container`.

## Before answering

Read `devdigest-mcp/INSIGHTS.md` first — it records what already cost someone time here —
then `README.md` for the tool table and the observed protocol era. Say in one line what you
took from them before you start.

## Commands

Uses **npm, not pnpm** (the server and client use pnpm; `reviewer-core` and `e2e` use npm).

- `npm ci`
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — vitest; every test stubs `fetch`, so no API, no DB, no network, no keys
- `npm run call -- src/server.ts <tool> '<json args>'` — call one tool over stdio in one
  shot and print the raw result. No Claude Code session, no MCP Inspector. Needs the API
  running (`./scripts/dev.sh`, seeded) for anything but a schema error.
- `npm start` — serve over stdio by hand.
- **Registered automatically** by the committed root `.mcp.json` (see `README.md` §
  *Registering with Claude Code*) — opening Claude Code at the repo root connects
  `devdigest` with no hand-wiring; `claude mcp list` shows it. `scripts/dev.sh` /
  `scripts/e2e.sh` still never touch this package — only the API it talks to. For a single
  tool call with no MCP registration at all, use `npm run call`.

## Invariants

Hold these when adding code. Breaking one still compiles.

- **stdout is the JSON-RPC channel.** All output goes through `src/log.ts`, which writes to
  stderr. **Nothing under `src/` or `scripts/` calls `console.log`** — a single stray write
  corrupts the protocol with no error message, no exception and no clue as to why: the
  server connects and then answers nothing. CI greps for it
  (`.github/workflows/mcp.yml`, step *stdout discipline*), because there is nothing to catch
  at runtime.
- **No `paths` alias into `@devdigest/shared` — ever**, and no alias into any other
  package's source. This package holds `zod@4` while `reviewer-core` holds `zod@3`; they
  stay apart only because nothing joins them. The trade is deliberate: the API's response
  fields are re-declared locally in `src/api/types.ts` and `src/types/blast.ts`, narrowed to
  exactly what the five tools read. **That means a renamed server field fails at runtime,
  not at `tsc`** — when a contract under `server/src/vendor/shared/contracts/` changes, this
  package does not find out. Keep the local types narrow so the surface that can drift stays
  small.
- **Five tools, and the set is asserted.** `test/server.test.ts` deep-equals the registered
  names against exactly `get_blast_radius`, `get_conventions`, `get_findings`, `list_agents`,
  `run_agent_on_pr`. A sixth tool fails it — that is the scope decision, not an accident.
- **Every tool reaches the API only through `src/api/client.ts`**, and nothing under
  `src/tools/` imports another tool. `src/server.ts` is the only file that imports across
  those boundaries.
- **`list_agents` never emits `system_prompt`**, on any path. `AgentSummary` has no such
  field (compile-time half) and `test/tools/list-agents.test.ts` asserts the serialized
  result carries neither the key nor a sentinel prompt (run-time half — the rows come from
  `fetch`, so a `{ ...row }` spread would typecheck and leak).
- **Tool input schemas stay flat and primitive** — strings, integers, booleans, plain enums,
  at most an array of them. No nested objects, no exotic `format`. A schema the Anthropic API
  rejects makes the whole tool vanish into `# Unavailable MCP Tools`, silently.

## Conventions

- The negotiated protocol era is **`2025-11-25` (legacy)** — observed, not assumed; see
  `README.md` § *Protocol era*. Deterministic `tools/list` ordering, `ttlMs`/`cacheScope`
  and the `io.modelcontextprotocol/tasks` extension are `2026-07-28` affordances and are
  deliberately not relied on anywhere.
- `serveStdio` is a **function** taking a server factory (v2), not v1's
  `new StdioServerTransport()` + `server.connect()`.
- `src/instructions.ts` is one sentence on purpose: `instructions` is billed every turn of
  every session this server is connected to. Reference prose goes in
  `src/resources/index.ts`, which costs nothing at session start.
- Tests are hermetic: `vi.stubGlobal('fetch', …)`. There is **no** `*.it.test.ts` in this
  package — that suffix is `server/`'s unit/integration split and means nothing here.
- Raising `run_agent_on_pr`'s `timeout_s` above its 600 s default requires raising
  `MCP_TOOL_TIMEOUT` in the committed root `.mcp.json` to match (committed at 660000 ms —
  60 s above the 600 s default). The client's wall clock is the one thing a progress
  notification cannot extend.

## Use when

- what the five tools take and return, and the protocol-era evidence → read `README.md`
- gotchas already hit here → read `INSIGHTS.md`
- why the package exists in this shape → `docs/plans/06-devdigest-mcp-server.md`
