/**
 * The package's ONLY sanctioned output path.
 *
 * **stdout is the JSON-RPC channel.** A single stray write to it corrupts the
 * protocol frame-for-frame: the server still connects, the client still lists
 * tools, and then a call simply never returns — with no error at either end and
 * no clue as to the cause. That is why this is a checked property (CI greps
 * `src/` and `scripts/` for any `console.log` call) and not a convention.
 *
 * Everything here writes through `console.error`, i.e. to **stderr**, which the
 * MCP client collects as the server's log and never parses as protocol.
 *
 * Deliberately `console.error` rather than `process.stderr.write`: the level is
 * the point, and a spy on `console.error` is what R15's test asserts against.
 */

type Level = 'INFO' | 'WARN' | 'ERROR';

function emit(level: Level, message: string, ...rest: unknown[]): void {
  // stderr, always. See the file header before changing this line.
  console.error(`[${new Date().toISOString()}] ${level} devdigest-mcp: ${message}`, ...rest);
}

export const log = {
  info: (message: string, ...rest: unknown[]): void => emit('INFO', message, ...rest),
  warn: (message: string, ...rest: unknown[]): void => emit('WARN', message, ...rest),
  error: (message: string, ...rest: unknown[]): void => emit('ERROR', message, ...rest),
};
