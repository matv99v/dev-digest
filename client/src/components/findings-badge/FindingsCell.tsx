/* FindingsCell — the counters plus their hover preview, as used by the PR list's
   FINDINGS column and by each run row in the PR-detail timeline.

   The card is PORTALLED to <body> rather than positioned inside the cell. The PR
   list's table card sets `overflow: hidden` (pulls/styles.ts), so a popover
   anchored inside a row is silently clipped at the row's edge — the card renders,
   it just cannot be seen. Fixed positioning off the anchor's bounding box also
   frees it from the row's stacking context. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import type { FindingRecord, PrFindingCounts } from "@devdigest/shared";
import { SeverityCounters } from "./SeverityCounters";
import { FindingsHoverCard } from "./FindingsHoverCard";
import { totalOf } from "./helpers";
import { CARD_WIDTH } from "./styles";

/** Pointer must rest this long before the card opens — a cursor crossing the
 *  column on its way elsewhere shouldn't strobe a popover per row. */
const OPEN_DELAY_MS = 150;
/** Grace period to travel from the counters into the card, which — being in a
 *  portal — is not a descendant of the anchor and so fires the anchor's leave. */
const CLOSE_DELAY_MS = 120;

const GAP = 8;
const MARGIN = 12;

interface Placement {
  left: number;
  top: number;
}

const anchorStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  display: "inline-flex",
  alignItems: "center",
  cursor: "pointer",
};

export function FindingsCell({
  counts,
  findings,
  loading = false,
  onOpen,
  onHoverChange,
}: {
  counts: PrFindingCounts | null | undefined;
  findings: FindingRecord[] | undefined;
  loading?: boolean;
  /** Where clicking should take the reader (the PR's Agent runs tab, or that
   *  run's accordion when we are already on it). */
  onOpen: () => void;
  /** Fires when the pointer enters/leaves, so the caller can fetch the preview
   *  lazily instead of loading findings for every row in the list. */
  onHoverChange?: (hovered: boolean) => void;
}) {
  const total = totalOf(counts);
  const hasFindings = total > 0;

  const anchorRef = React.useRef<HTMLButtonElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hovered, setHovered] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [placement, setPlacement] = React.useState<Placement | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const clearTimers = React.useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  React.useEffect(() => clearTimers, [clearTimers]);

  const enter = React.useCallback(() => {
    if (!hasFindings) return;
    clearTimers();
    setHovered(true);
    onHoverChange?.(true);
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }, [hasFindings, clearTimers, onHoverChange]);

  const leave = React.useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => {
      setHovered(false);
      setOpen(false);
      onHoverChange?.(false);
    }, CLOSE_DELAY_MS);
  }, [clearTimers, onHoverChange]);

  // Measure after paint: the flip decision needs the card's real height, which
  // depends on how many findings and how long their titles are.
  React.useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const height = cardRef.current?.offsetHeight ?? 0;
    const below = anchor.bottom + GAP;
    const flip = height > 0 && below + height > window.innerHeight - MARGIN;
    setPlacement({
      left: Math.max(
        MARGIN,
        Math.min(anchor.left, window.innerWidth - CARD_WIDTH - MARGIN),
      ),
      top: flip ? Math.max(MARGIN, anchor.top - GAP - height) : below,
    });
  }, [open, findings, loading]);

  const activate = (e: React.MouseEvent | React.KeyboardEvent) => {
    // The whole PR row is a click target that routes to the Overview tab; without
    // this the row's handler wins and the reader lands on the wrong tab.
    e.stopPropagation();
    onOpen();
  };

  if (!hasFindings) {
    return <SeverityCounters counts={counts} />;
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={`${total} findings`}
        style={anchorStyle}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
        onClick={activate}
      >
        <SeverityCounters counts={counts} interactive hovered={hovered} />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={cardRef}
            onMouseEnter={clearTimers}
            onMouseLeave={leave}
            onClick={activate}
            style={{
              position: "fixed",
              zIndex: 40,
              left: placement?.left ?? 0,
              top: placement?.top ?? 0,
              // Until measured, the card is laid out but invisible — otherwise it
              // flashes at the top-left corner for one frame before placement.
              visibility: placement ? "visible" : "hidden",
            }}
          >
            <FindingsHoverCard findings={findings} loading={loading} />
          </div>,
          document.body,
        )}
    </>
  );
}

export default FindingsCell;
