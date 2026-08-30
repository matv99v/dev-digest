/** Positioning + timing constants kept out of the component so they're easy to
    tune without touching JSX. */

/** Delay before closing after the pointer leaves trigger AND panel — long
    enough for the mouse to travel from one to the other. */
export const CLOSE_DELAY_MS = 120;

/** Used to decide whether the panel should flip above the trigger; the panel's
    real height is unknown until it renders, so this is a conservative guess. */
export const ESTIMATED_PANEL_HEIGHT = 340;

export const PANEL_WIDTH = 380;
const VIEWPORT_MARGIN = 12;

export interface PanelPosition {
  top: number;
  left: number;
  placement: "below" | "above";
}

/** Compute a fixed-position placement for the panel from the trigger's rect,
    clamped horizontally to the viewport and flipped above the trigger when it
    would otherwise overflow the bottom. */
export function positionFromTrigger(rect: DOMRect): PanelPosition {
  const overflowsBelow =
    rect.bottom + ESTIMATED_PANEL_HEIGHT + VIEWPORT_MARGIN > window.innerHeight;
  const placement = overflowsBelow ? "above" : "below";
  const top = placement === "below" ? rect.bottom + 8 : rect.top - 8;
  let left = rect.left;
  const maxLeft = window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN;
  if (left > maxLeft) left = Math.max(VIEWPORT_MARGIN, maxLeft);
  return { top, left, placement };
}
