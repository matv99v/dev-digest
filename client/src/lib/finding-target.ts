/* finding-target.ts — a one-shot handoff for "open this PR and scroll to this
   finding", used when navigating from a findings hover preview on another page.

   Deliberately NOT a URL param: the target is a command, not page state, so
   putting it in the URL made it flash in and back out of the address bar and
   left a UUID in a link that would re-scroll on every reload. App Router
   navigations keep the JS context alive, so a module-level slot carries it
   across the push and dies with a real page load — exactly the lifetime a
   one-shot command should have.

   An explicit `?finding=` in a hand-shared link still works; that path is
   handled by the PR detail page, and stays in the URL because there the user
   put it there on purpose. */

import React from "react";

let pending: { prNumber: number; findingId: string } | null = null;

/** Queue a finding to scroll to on the PR page we are about to navigate to. */
export function setPendingFinding(prNumber: number, findingId: string): void {
  pending = { prNumber, findingId };
}

/** Read and clear the queued finding for this PR, if the queue holds one. */
export function takePendingFinding(prNumber: number): string | null {
  if (pending?.prNumber !== prNumber) return null;
  const { findingId } = pending;
  pending = null;
  return findingId;
}

/**
 * Claim the queued finding for this PR, exactly once per PR.
 *
 * The ref guard is load-bearing, not defensive: `takePendingFinding` is a
 * one-shot, and StrictMode runs effects TWICE in dev — so a naive effect took
 * the id on the first pass and then overwrote it with the second pass's `null`,
 * leaving the deep link silently dead in development only. Keyed by prNumber so
 * navigating between PRs still claims each one's handoff.
 */
export function useHandoffFinding(prNumber: string | number): string | null {
  const [findingId, setFindingId] = React.useState<string | null>(null);
  const claimedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = String(prNumber);
    if (claimedFor.current === key) return;
    claimedFor.current = key;
    setFindingId(takePendingFinding(Number(prNumber)));
  }, [prNumber]);
  return findingId;
}
