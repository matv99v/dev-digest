/* FindingsPreview — hover popover listing a PR's (or one run's) findings, used
   by both the PR list's FINDINGS column and the PR detail timeline's per-run
   counters. Portaled to <body> so it is never clipped by an ancestor's
   `overflow: hidden` (the PR list's table card has one) — see the plan's
   Gotchas. Selecting an entry deep-links to that finding's card. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon, CategoryTag, ConfidenceNum, SEV, Skeleton } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { lineLabel } from "@/lib/finding-format";
import { CLOSE_DELAY_MS, PANEL_WIDTH, positionFromTrigger, type PanelPosition } from "./helpers";

const panelStyle = (pos: PanelPosition): React.CSSProperties => ({
  position: "fixed",
  top: pos.top,
  left: pos.left,
  width: PANEL_WIDTH,
  maxHeight: 420,
  overflowY: "auto",
  // Nothing may scroll sideways: a long file path used to widen the content
  // past the panel, and the resulting horizontal scroll hid the left edge of
  // every line. Each row below is responsible for shrinking instead.
  overflowX: "hidden",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-strong)",
  borderRadius: 9,
  boxShadow: "var(--shadow-modal)",
  padding: 8,
  zIndex: 60,
  animation: "ddpop .12s ease",
  transform: pos.placement === "above" ? "translateY(-100%)" : undefined,
});

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 6px 8px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const entryStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  borderRadius: 6,
  padding: "8px 6px",
  cursor: "pointer",
  color: "inherit",
  font: "inherit",
};

const entryHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 3,
  minWidth: 0,
};

const entryTitleStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-primary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const entryMetaStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 4,
  minWidth: 0,
};

// A repo path is long and unbreakable, so it must be the row's flexible part —
// it truncates while the confidence figure beside it keeps its full width.
const fileLineStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary)",
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const noShrinkStyle: React.CSSProperties = { flexShrink: 0 };

const rationaleStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-muted)",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  // Rationales quote identifiers and paths — break them rather than let one
  // long token widen the panel.
  overflowWrap: "anywhere",
};

function FindingEntry({ f, onSelect }: { f: FindingRecord; onSelect: (id: string) => void }) {
  const meta = SEV[f.severity];
  const I = Icon[meta.icon];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(f.id);
      }}
      style={entryStyle}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
    >
      <div style={entryHeaderStyle}>
        <I size={13} style={{ color: meta.c, flexShrink: 0 }} />
        <span style={entryTitleStyle} title={f.title}>
          {f.title}
        </span>
        <span style={noShrinkStyle}>
          <CategoryTag category={f.category} />
        </span>
      </div>
      <div style={entryMetaStyle}>
        <span className="mono" style={fileLineStyle} title={`${f.file}:${lineLabel(f)}`}>
          {f.file}:{lineLabel(f)}
        </span>
        <span style={noShrinkStyle}>
          <ConfidenceNum value={f.confidence} />
        </span>
      </div>
      <div style={rationaleStyle}>{f.rationale}</div>
    </button>
  );
}

export interface FindingsPreviewProps {
  /** undefined while not yet fetched; [] once loaded with no findings. */
  findings: FindingRecord[] | undefined;
  loading?: boolean;
  /** true when this preview is scoped to one run, for the header copy. */
  scopedToRun?: boolean;
  /** Fired when the popover opens/closes — callers use this to lazily fetch
      `findings` only once the trigger is actually hovered. */
  onOpenChange?: (open: boolean) => void;
  onSelect: (findingId: string) => void;
  children: React.ReactNode;
}

export function FindingsPreview({
  findings,
  loading,
  scopedToRun,
  onOpenChange,
  onSelect,
  children,
}: FindingsPreviewProps) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<PanelPosition | null>(null);
  const wrapperRef = React.useRef<HTMLSpanElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      onOpenChange?.(false);
    }, CLOSE_DELAY_MS);
  };
  const handleEnter = () => {
    cancelClose();
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) setPos(positionFromTrigger(rect));
    setOpen(true);
    onOpenChange?.(true);
  };

  React.useEffect(() => () => cancelClose(), []);

  const count = findings?.length ?? 0;
  const title = scopedToRun
    ? t("preview.titleInRun", { count })
    : t("preview.title", { count });

  return (
    <span
      ref={wrapperRef}
      onMouseEnter={handleEnter}
      onMouseLeave={scheduleClose}
      style={{ display: "inline-flex" }}
    >
      {children}
      {open &&
        pos &&
        createPortal(
          <div style={panelStyle(pos)} onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
            <div style={headerStyle}>
              <Icon.AlertOctagon size={12} />
              {loading ? t("preview.loading") : title}
            </div>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "6px 6px 8px" }}>
                <Skeleton height={13} />
                <Skeleton height={13} width="70%" />
              </div>
            ) : (
              findings?.map((f) => <FindingEntry key={f.id} f={f} onSelect={onSelect} />)
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}

export default FindingsPreview;
