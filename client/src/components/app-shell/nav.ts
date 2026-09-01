import type { NavGroup } from "@devdigest/ui";

/**
 * App-owned sidebar nav (L02). Passed to `AppFrame` via `ShellContext.nav` so
 * new sections land here instead of requiring an edit to the vendored
 * `@devdigest/ui` package. `useShellCommands` and `useGlobalShortcuts` read
 * this too, so the command palette and `g`-then-key shortcuts stay in sync
 * with the sidebar automatically.
 */
export const APP_NAV: NavGroup[] = [
  {
    section: "WORKSPACE",
    items: [
      { key: "pulls", label: "Pull Requests", icon: "GitPullRequest", href: "/repos/:repoId/pulls", gKey: "p" },
    ],
  },
  {
    section: "SKILLS LAB",
    items: [
      { key: "skills", label: "Skills", icon: "Sparkles", href: "/skills", gKey: "s" },
      { key: "agents", label: "Agents", icon: "Cpu", href: "/agents", gKey: "a" },
    ],
  },
];
