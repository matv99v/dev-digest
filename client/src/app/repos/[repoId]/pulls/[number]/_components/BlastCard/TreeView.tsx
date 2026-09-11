/* TreeView — the default view of a blast radius: one disclosure row per changed
   symbol, its resolved callers as `file:line` links, and the endpoints/crons the
   index attributes to those callers. Every link is pinned to `indexed_sha`
   (R11), never to the PR head. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { PrBlastRadius, ChangedSymbol } from "@/lib/types";
import { blastHref, downstreamFor, isSymbolOpenByDefault } from "./helpers";
import { s } from "./styles";

interface ViewProps {
  data: PrBlastRadius;
  repoFullName: string | null;
  /** The sha every link is pinned to — `indexed_sha`, never `head_sha`. */
  sha: string;
}

export function TreeView({ data, repoFullName, sha }: ViewProps) {
  const t = useTranslations("blast");
  // The open set lives here, so expanding one row never remounts another
  // (client/INSIGHTS.md, 2026-09-06). Rows are keyed by name+file, which is
  // stable across renders — a key is never used to force a row open.
  const [open, setOpen] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      data.changed_symbols.map((sym, i) => [symbolKey(sym), isSymbolOpenByDefault(i)]),
    ),
  );

  if (data.changed_symbols.length === 0) {
    return <p style={s.note}>{t("noDownstream", { count: 0 })}</p>;
  }

  return (
    <div style={s.tree}>
      {data.changed_symbols.map((sym) => {
        const key = symbolKey(sym);
        return (
          <SymbolRow
            key={key}
            symbol={sym}
            data={data}
            repoFullName={repoFullName}
            sha={sha}
            open={open[key] ?? false}
            onOpenChange={(next) => setOpen((prev) => ({ ...prev, [key]: next }))}
          />
        );
      })}
      <ReverseImpact data={data} repoFullName={repoFullName} sha={sha} />
    </div>
  );
}

function symbolKey(sym: ChangedSymbol): string {
  return `${sym.file}#${sym.name}`;
}

/** One changed symbol. `open`/`onOpenChange` are an optional controlled pair
    with an uncontrolled fallback, so a parent can drive the row without
    remounting it. */
function SymbolRow({
  symbol,
  data,
  repoFullName,
  sha,
  open,
  onOpenChange,
  defaultOpen,
}: ViewProps & {
  symbol: ChangedSymbol;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("blast");
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen ?? false);
  const isOpen = open ?? uncontrolled;
  const toggle = () => {
    if (onOpenChange) onOpenChange(!isOpen);
    else setUncontrolled(!isOpen);
  };

  const impact = downstreamFor(data, symbol.name);
  const callers = impact?.callers ?? [];
  const Chevron = isOpen ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <div style={s.symbolRow}>
      <button type="button" onClick={toggle} aria-expanded={isOpen} style={s.symbolHeader}>
        <Chevron size={14} aria-hidden />
        <span className="mono" style={s.symbolName}>
          {symbol.name}
        </span>
        <span style={s.symbolMeta}>
          {symbol.kind} · {t("declaredIn")}
        </span>
        <FileRef repoFullName={repoFullName} sha={sha} file={symbol.file} />
        <span style={s.spacer} />
        <Badge icon="Users">{t("callerCount", { count: callers.length })}</Badge>
      </button>

      {isOpen && (
        <div style={s.symbolBody}>
          {callers.length > 0 && (
            <div>
              <div style={s.listLabel}>{t("stat.callers")}</div>
              <ul style={s.list}>
                {callers.map((caller, i) => (
                  <li key={`${caller.file}:${caller.line}:${i}`} style={s.listItem}>
                    <Icon.CornerDownRight size={12} aria-hidden />
                    <FileRef
                      repoFullName={repoFullName}
                      sha={sha}
                      file={caller.file}
                      line={caller.line}
                    />
                    <span style={s.symbolMeta}>{t("viaSymbol", { symbol: caller.name })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ImpactChips
            label={t("potentiallyAffected")}
            icon="Globe"
            items={impact?.endpoints_affected ?? []}
          />
          <ImpactChips
            label={t("potentiallyAffectedCrons")}
            icon="Clock"
            items={impact?.crons_affected ?? []}
          />
        </div>
      )}
    </div>
  );
}

/** The reverse import walk: files that import a changed file within
    REVERSE_DEPTH, and the endpoints/crons they register. Never asserted as
    reached — the heading says *potentially affected* (R14). */
function ReverseImpact({ data, repoFullName, sha }: ViewProps) {
  const t = useTranslations("blast");
  const groups = data.reverse.filter((r) => r.dependents.length > 0);
  if (groups.length === 0) return null;

  return (
    <div style={s.reverseGroup}>
      <div style={s.listLabel}>{t("reverseTitle")}</div>
      {groups.map((group) => (
        <div key={group.changed_file}>
          <div style={s.listItem}>
            <Icon.FileText size={12} aria-hidden />
            <FileRef repoFullName={repoFullName} sha={sha} file={group.changed_file} />
          </div>
          <ul style={s.list}>
            {group.dependents.map((dep) => (
              <li key={`${dep.file}:${dep.depth}`} style={s.listItem}>
                <Icon.CornerDownRight size={12} aria-hidden />
                <FileRef repoFullName={repoFullName} sha={sha} file={dep.file} />
                <span style={s.symbolMeta}>
                  {t("depth", { depth: dep.depth })} · {t("viaSymbol", { symbol: dep.via })}
                </span>
                {dep.endpoints.map((ep) => (
                  <Badge key={ep} mono icon="Globe">
                    {ep}
                  </Badge>
                ))}
                {dep.crons.map((cron) => (
                  <Badge key={cron} mono icon="Clock">
                    {cron}
                  </Badge>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ImpactChips({
  label,
  icon,
  items,
}: {
  label: string;
  icon: "Globe" | "Clock";
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div style={s.listLabel}>{label}</div>
      <div style={s.chipRow}>
        {items.map((item) => (
          <Badge key={item} mono icon={icon}>
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/** A `file` or `file:line` reference. A link only when the repo's full name is
    known; otherwise plain mono text, never a broken github.com URL. */
function FileRef({
  repoFullName,
  sha,
  file,
  line,
}: {
  repoFullName: string | null;
  sha: string;
  file: string;
  line?: number;
}) {
  const label = line != null ? `${file}:${line}` : file;
  if (!repoFullName) {
    return (
      <span className="mono" style={s.symbolMeta}>
        {label}
      </span>
    );
  }
  return <MonoLink href={blastHref(repoFullName, sha, file, line)}>{label}</MonoLink>;
}
