/**
 * The server's `instructions` string — one sentence, and deliberately so.
 *
 * This is the one piece of this server's prose that **tool search does not
 * defer**. Tool *definitions* are fetched on demand; `instructions` is lifted
 * into its own `# MCP Server Instructions` prompt section and billed on every
 * turn of every session in which this server is connected, whether or not a
 * single tool is ever called — and it is truncated at a threshold nobody has
 * been able to establish. A paragraph here is a per-turn tax with an unknown
 * cut-off; a tool catalogue here duplicates, at full price, what the client
 * already fetches for free when it needs it.
 *
 * So the budget is spent on the one thing a client cannot discover from the
 * tool list: the **order** the three tools are meant to be called in. Every
 * other piece of reference prose — the score rubric, the severity vocabulary,
 * the blast-radius explainer — lives in `src/resources/index.ts` as an MCP
 * Resource, which costs nothing at session start and is read on demand.
 *
 * `test/resources/instructions.test.ts` holds the two properties to the wall:
 * no newline, under 200 characters, all three tool names present (R11).
 */

export const instructions =
  'Call list_agents for an agent id, then run_agent_on_pr (it waits for the review to finish), then get_findings; a PR is `owner/repo#N` or a uuid, a repo is `owner/repo` or a uuid.';
