/* BlastCard helpers — pure functions only. Everything the card asserts on
   (link shas, mermaid source) lives here rather than in a component, because
   mermaid renders by measuring the DOM and jsdom implements no SVG layout. */
import type { DownstreamImpact, PrBlastRadius, Repo } from "@/lib/types";
import { githubBlobUrl } from "@/lib/github-urls";
import { SHA_FALLBACK } from "./constants";

/**
 * The sha every `file:line` in this card is pinned to.
 *
 * Callers and dependents are index rows computed at `lastIndexedSha`, which the
 * response carries as `indexed_sha` — **never** the PR head sha. The index is
 * routinely behind the head, and a head-sha link then lands on a moved or
 * deleted line. Falls back to the repo's default branch the way
 * `conventions/.../ConventionCard/helpers.ts` does.
 */
export function blastLinkSha(
  data: Pick<PrBlastRadius, "indexed_sha">,
  activeRepo: Pick<Repo, "default_branch"> | null | undefined,
): string {
  return data.indexed_sha ?? activeRepo?.default_branch ?? SHA_FALLBACK;
}

/** github.com blob URL for one index row, pinned to the index sha. */
export function blastHref(
  repoFullName: string,
  sha: string,
  file: string,
  line?: number,
): string {
  return githubBlobUrl(repoFullName, sha, file, line);
}

/** The downstream entry for one changed symbol, or undefined when the index
    resolved no callers for it. Matched by name — `DownstreamImpact.symbol`. */
export function downstreamFor(
  data: Pick<PrBlastRadius, "downstream">,
  symbolName: string,
): DownstreamImpact | undefined {
  return data.downstream.find((d) => d.symbol === symbolName);
}

/**
 * Which symbol rows start expanded. Shared by `TreeView` (which owns the open
 * set) and by each row's uncontrolled fallback, so both sides compute the same
 * first value — never a `key` flip, which remounts and discards state
 * (client/INSIGHTS.md, 2026-09-06).
 */
export function isSymbolOpenByDefault(index: number): boolean {
  return index === 0;
}

/**
 * Make one repo-supplied string safe to interpolate into a quoted mermaid
 * label. Every label here is a path or symbol name from an arbitrary indexed
 * third-party repository, so it is untrusted input reaching a parser.
 *
 * Order is load-bearing: `#` is replaced **before** `"`, or the `"` → `#quot;`
 * substitution is itself rewritten into `#35;quot;` by the `#` pass — and
 * mermaid rewrites every `#\w+;` across the whole diagram text before parsing,
 * so the original characters are destroyed with nothing throwing.
 *
 * `"` is the only character that breaks the parser inside a quoted label
 * (`flow.jison` matches `<string>[^"]+` with no backslash escape). The newline
 * is the security-relevant one: it terminates the statement and lets the rest
 * of the label be parsed as diagram *source*, including `---` frontmatter and
 * `%%{init:…}%%` directives, which reach `themeCSS`/`themeVariables`. POSIX
 * permits `\n` in a filename and git can store one, so this is not theoretical.
 */
export function escapeMermaidLabel(label: string): string {
  return label
    .replace(/#/g, "#35;")
    .replace(/"/g, "#quot;")
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .trim();
}

/** Keep a URL inside its quoted `click … href "…"` argument. `#L<line>` is left
    alone: mermaid's entity rewrite needs a trailing `;`, so an anchor survives
    it, and escaping the `#` here would break every deep link. */
function safeMermaidHref(url: string): string {
  return url.replace(/[\r\n\u2028\u2029]+/g, "").replace(/"/g, "%22");
}

/**
 * The mermaid `flowchart` source for one blast radius — a pure function, which
 * is where every assertion lands: mermaid renders by measuring the DOM and
 * jsdom implements no SVG layout, so a component test cannot inspect the
 * produced `<svg:a>`.
 *
 * Node ids are generated (`n0, n1, …`) and never derived from a path, so no
 * path character can reach an id. Every node with a `file`/`file:line` carries
 * a `click … href` line pinned to `indexedSha` — the same sha rule as the Tree
 * view (R11/R16), never the PR head.
 *
 * Returns `""` when there is nothing to draw, so the caller can say so rather
 * than render an empty box.
 */
export function buildFlowchart(
  payload: Pick<PrBlastRadius, "changed_symbols" | "downstream" | "reverse">,
  repoFullName: string | null,
  indexedSha: string,
): string {
  const body: string[] = [];
  const clicks: string[] = [];
  let seq = 0;

  const node = (label: string, file?: string, line?: number, indent = "  "): string => {
    const id = `n${seq++}`;
    body.push(`${indent}${id}["${escapeMermaidLabel(label)}"]`);
    if (repoFullName && file) {
      clicks.push(`  click ${id} href "${safeMermaidHref(blastHref(repoFullName, indexedSha, file, line))}"`);
    }
    return id;
  };

  // One subgraph per changed symbol: the declaration, then its resolved callers.
  const symbolIdByFile = new Map<string, string[]>();
  payload.changed_symbols.forEach((sym, i) => {
    body.push(`  subgraph sg${i}["${escapeMermaidLabel(sym.name)}"]`);
    const symId = node(`${sym.name} (${sym.kind})`, sym.file, undefined, "    ");
    symbolIdByFile.set(sym.file, [...(symbolIdByFile.get(sym.file) ?? []), symId]);
    const impact = payload.downstream.find((d) => d.symbol === sym.name);
    for (const caller of impact?.callers ?? []) {
      const callerId = node(`${caller.file}:${caller.line}`, caller.file, caller.line, "    ");
      body.push(`    ${symId} --> ${callerId}`);
    }
    body.push("  end");

    // Endpoints and crons hang off the symbol, outside the subgraph, and carry
    // no link — they are regex-derived facts about a file, not a location.
    for (const endpoint of impact?.endpoints_affected ?? []) {
      body.push(`  ${symId} --> ${node(endpoint)}`);
    }
    for (const cron of impact?.crons_affected ?? []) {
      body.push(`  ${symId} --> ${node(cron)}`);
    }
  });

  // The reverse import walk, rooted at the symbols declared in each changed
  // file. A depth-2 dependent hangs off the depth-1 file it was reached via.
  for (const group of payload.reverse) {
    const roots = symbolIdByFile.get(group.changed_file) ?? [];
    if (roots.length === 0) continue;
    const idByFile = new Map<string, string>();
    for (const dep of [...group.dependents].sort((a, b) => a.depth - b.depth)) {
      const depId = node(dep.file, dep.file);
      idByFile.set(dep.file, depId);
      const parents = dep.depth > 1 && idByFile.has(dep.via) ? [idByFile.get(dep.via)!] : roots;
      for (const parent of parents) body.push(`  ${parent} --> ${depId}`);
    }
  }

  if (body.length === 0) return "";
  return ["flowchart LR", ...body, ...clicks].join("\n");
}
