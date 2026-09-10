#!/usr/bin/env node
/**
 * One-shot stdio MCP harness. Permanent — the probe it was written for is not.
 *
 *   node scripts/call.mjs <entry> <tool> ['<json args>']
 *   node scripts/call.mjs probe/probe.ts probe_era
 *   npm run call -- src/server.ts list_agents '{}'
 *
 * It spawns one server over stdio, performs the handshake, calls exactly one
 * tool, prints the JSON result and exits. Every tool is therefore exercisable
 * without a Claude Code session.
 *
 * Exit codes: 0 the tool returned a result · 1 the tool returned isError, or
 * the server died / timed out · 2 the tool is not registered (its name and the
 * registered set are printed to stderr).
 *
 * This is a *client*: its stdout is your terminal, not the JSON-RPC channel —
 * that belongs to the server it spawns. It still writes through
 * `process.stdout.write` rather than `console.log`, because the R15 CI guard
 * greps `scripts/` as well as `src/` and a guard with an exception is not a
 * guard.
 *
 * Environment: `DEVDIGEST_API_BASE` is inherited by the spawned server.
 * `MCP_PROTOCOL_VERSION` overrides the protocol version this client advertises
 * in `initialize` (default 2025-11-25) — the era is negotiated, so what the
 * client asks for is half the answer.
 * `MCP_CALL_TIMEOUT_MS` bounds the whole run (default 120000).
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, '..');
const PROTOCOL_VERSION = process.env.MCP_PROTOCOL_VERSION ?? '2025-11-25';
const TIMEOUT_MS = Number(process.env.MCP_CALL_TIMEOUT_MS ?? 120000);

const [entryArg, toolName, argsArg] = process.argv.slice(2);

if (!entryArg || !toolName) {
  process.stderr.write(
    "usage: node scripts/call.mjs <entry> <tool> ['<json args>']\n" +
      "  e.g. node scripts/call.mjs probe/probe.ts probe_era\n" +
      "       node scripts/call.mjs src/server.ts get_findings '{\"pr\":\"acme/web#42\"}'\n",
  );
  process.exit(2);
}

let toolArgs;
try {
  toolArgs = argsArg ? JSON.parse(argsArg) : {};
} catch (err) {
  process.stderr.write(`arguments are not valid JSON: ${err.message}\n`);
  process.exit(2);
}

const entryPath = path.resolve(PKG_ROOT, entryArg);
const isTs = entryPath.endsWith('.ts');

// tsx is a devDependency of this package; resolve it rather than relying on npx
// reaching the network on a cold cache.
let command;
let commandArgs;
if (isTs) {
  const require = createRequire(import.meta.url);
  let tsxBin;
  try {
    tsxBin = require.resolve('tsx/cli');
  } catch {
    tsxBin = path.join(PKG_ROOT, 'node_modules', '.bin', 'tsx');
  }
  command = process.execPath;
  commandArgs = [tsxBin, entryPath];
} else {
  command = process.execPath;
  commandArgs = [entryPath];
}

const child = spawn(command, commandArgs, {
  cwd: PKG_ROOT,
  stdio: ['pipe', 'pipe', 'inherit'], // server stderr passes straight through
  env: process.env,
});

let nextId = 0;
const pending = new Map();
let buffer = '';

child.stdout.setEncoding('utf8');
child.stdout.on('data', chunk => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      // Anything non-JSON on stdout is exactly the corruption R15 exists to
      // prevent — surface it rather than swallowing it.
      process.stderr.write(`non-JSON line on the server's stdout: ${line}\n`);
      continue;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
      else resolve(msg.result);
    }
  }
});

function send(message) {
  child.stdin.write(JSON.stringify(message) + '\n');
}

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ jsonrpc: '2.0', id, method, params });
  });
}

function notify(method, params) {
  send({ jsonrpc: '2.0', method, params });
}

function fail(code, message) {
  process.stderr.write(message.endsWith('\n') ? message : message + '\n');
  child.kill('SIGTERM');
  process.exit(code);
}

const deadline = setTimeout(() => {
  fail(1, `timed out after ${TIMEOUT_MS}ms waiting on ${entryArg}`);
}, TIMEOUT_MS);

child.on('exit', code => {
  if (code !== 0) {
    clearTimeout(deadline);
    process.stderr.write(`server exited with code ${code} before the call completed\n`);
    process.exit(1);
  }
});

try {
  const init = await request('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'devdigest-mcp-harness', version: '0.0.0' },
  });
  process.stderr.write(
    `[harness] negotiated protocolVersion: ${init?.protocolVersion ?? '(none reported)'}\n`,
  );
  notify('notifications/initialized', {});

  const listed = await request('tools/list', {});
  const names = (listed?.tools ?? []).map(t => t.name);
  if (!names.includes(toolName)) {
    fail(
      2,
      `tool not found: ${toolName}\nregistered tools: ${names.length ? names.join(', ') : '(none)'}`,
    );
  }

  const result = await request('tools/call', { name: toolName, arguments: toolArgs });
  clearTimeout(deadline);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  child.kill('SIGTERM');
  process.exit(result?.isError ? 1 : 0);
} catch (err) {
  clearTimeout(deadline);
  fail(1, `call failed: ${err.message}`);
}
