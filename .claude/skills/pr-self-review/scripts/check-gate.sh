#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash). Denies a push / PR-open / PR-merge command unless a fresh
# pr-self-review PASS is on record for the CURRENT diff. It never runs the review - it only
# enforces that one ran and passed. Wired in .claude/settings.json.
#
# Decision model (exit 2 = deny and show stderr to the agent; exit 0 = allow):
#   command isn't a push/PR command ....... allow
#   PR_SELF_REVIEW_OVERRIDE set ........... allow, logged
#   no state file ......................... deny  (run /pr-self-review first)
#   verdict BLOCKED ....................... deny
#   diff moved since the review ........... deny  (stale PASS)
#   PASS + hash matches ................... allow
#   any internal error .................... allow (fail open)
#
# Fail-open is deliberate: a bug in this hook must never brick every push in the repo. Deny
# only on a fact actually established, never on an unknown.
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
STATE="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}/.pr-self-review.json"

read_field() {
  # $1 = state path, $2 = field. Prints the value, or ERR when unreadable.
  node -e '
    const fs = require("fs");
    try {
      const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      process.stdout.write(String(j[process.argv[2]] ?? ""));
    } catch { process.stdout.write("ERR"); }
  ' "$1" "$2" 2>/dev/null || echo "ERR"
}

# Does this command actually INVOKE a push / PR-open / PR-merge?
#
# Matching a bare substring is wrong and was the first bug this hook hit: it fires on any
# command that merely *mentions* the words - writing documentation about the gate, grepping
# the logs, echoing a reminder. So: strip heredoc bodies and comments first, then require the
# verb at the start of a command segment (start of input, or after ; && || | newline),
# allowing env assignments and flags like `git -C dir`.
is_push_command() {
  node -e '
    let s = "";
    process.stdin.on("data", d => s += d).on("end", () => {
      let cmd = "";
      try {
        const j = JSON.parse(s);
        cmd = (j.tool_input && j.tool_input.command) || "";
      } catch { process.stdout.write("no"); return; }

      // Drop heredoc bodies: <<EOF ... EOF / <<-"EOF" ... EOF
      cmd = cmd.replace(/<<-?\s*(["\x27]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm, " ");
      // Drop trailing heredoc with no closing delimiter (truncated command)
      cmd = cmd.replace(/<<-?\s*(["\x27]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*$/m, " ");
      // Drop full-line shell comments
      cmd = cmd.replace(/^\s*#.*$/gm, " ");

      const seg = "(?:^|[;&|]|&&|\\|\\||\\n)\\s*(?:[A-Za-z_][A-Za-z0-9_]*=\\S*\\s+)*";
      const gitPush = new RegExp(seg + "(?:sudo\\s+)?git(?:\\s+-[^\\s]+(?:\\s+[^\\s-][^\\s]*)?)*\\s+push\\b");
      const ghPr    = new RegExp(seg + "(?:sudo\\s+)?gh\\s+pr\\s+(?:create|merge)\\b");

      process.stdout.write(gitPush.test(cmd) || ghPr.test(cmd) ? "yes" : "no");
    });
  ' 2>/dev/null || echo "no"
}

if [ "$(is_push_command)" != "yes" ]; then
  exit 0
fi

if [ -n "${PR_SELF_REVIEW_OVERRIDE:-}" ]; then
  echo "pr-self-review: overridden - reason: ${PR_SELF_REVIEW_OVERRIDE}" >&2
  exit 0
fi

if [ ! -f "$STATE" ]; then
  echo "BLOCKED pr-self-review: no review on record for this branch." >&2
  echo "   Run /pr-self-review before pushing or opening a PR" >&2
  echo "   (or set PR_SELF_REVIEW_OVERRIDE=\"reason\" for a genuine hotfix)." >&2
  exit 2
fi

verdict="$(read_field "$STATE" verdict)"
saved="$(read_field "$STATE" diffHash)"

# Unreadable or malformed state -> fail open rather than block every push in the repo.
[ "$verdict" = "ERR" ] && exit 0
[ "$saved" = "ERR" ] && exit 0
[ -z "$verdict" ] && exit 0
[ -z "$saved" ] && exit 0

if [ "$verdict" = "BLOCKED" ]; then
  n="$(read_field "$STATE" criticalCount)"
  echo "BLOCKED pr-self-review: the last review blocked this branch (${n:-?} critical)." >&2
  echo "   Fix them and re-run /pr-self-review, or set PR_SELF_REVIEW_OVERRIDE=\"reason\"." >&2
  exit 2
fi

current="$("$DIR/diff-hash.sh" 2>/dev/null || echo "ERR")"
[ "$current" = "ERR" ] && exit 0   # can't compute -> fail open
[ -z "$current" ] && exit 0

if [ "$saved" != "$current" ]; then
  echo "BLOCKED pr-self-review: your changes moved since the last review - that PASS is stale." >&2
  echo "   Re-run /pr-self-review so the gate reflects what you are about to push." >&2
  exit 2
fi

exit 0
