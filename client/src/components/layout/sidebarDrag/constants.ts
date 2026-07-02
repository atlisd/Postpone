// All engine timings/thresholds in one place.

/** Pointer must travel this many px before a drag activates (plain clicks stay clicks). */
export const ACTIVATION_DISTANCE = 5;

/**
 * Dwell time in a row's middle zone before the drop commits as "into folder /
 * merge". The tint appears immediately on entering the zone; the latch firing
 * upgrades it to the ring. A fast drag-through-and-release still resolves to an
 * insertion — accidental drops reorder, never merge.
 */
export const INTO_LATCH_MS = 250;

/** Dwell on a collapsed folder row (dragging a project) before it expands for the drag. */
export const AUTO_EXPAND_MS = 500;

/** Fraction of a row's height at top/bottom that means "insert above/below" when the middle zone is active. */
export const EDGE_FRACTION = 0.3;

/** Distance from the nav's top/bottom edge (px) where auto-scroll engages. */
export const EDGE_SCROLL_ZONE = 28;

/** Max auto-scroll speed, px per frame. */
export const MAX_SCROLL_SPEED = 14;

/** Transition used for the traveling gap on neighbor rows. */
export const GAP_TRANSITION = 'transform 160ms cubic-bezier(0.2, 0, 0, 1)';

/** Ghost settle animation on drop. */
export const DROP_ANIM_MS = 150;

/** Ghost return animation on cancel, and merge shrink animation. */
export const CANCEL_ANIM_MS = 120;

/** Vertical gap between sidebar rows (Tailwind space-y-1 = 4px); included in the traveling gap height. */
export const ROW_GAP = 4;
