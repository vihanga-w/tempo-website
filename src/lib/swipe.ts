/**
 * When a drag counts as a swipe.
 *
 * Discover's first thresholds were a flat 90px or 550px a second, and both are
 * too much: a deliberate swipe had to be dragged most of the way across the
 * card before it took, which reads as the gesture not working rather than as
 * the app being careful. The shape used across iOS is a short distance *or* a
 * flick — the distance says "I meant this", the speed says "I meant this and I
 * am already done" — so either decides, and neither has to be large.
 */

/** A flick decides on its own, however short it was. */
export const FLICK_SPEED = 320;
/** …as long as the finger actually went somewhere, so a fast tap is not a swipe. */
export const FLICK_MIN_OFFSET = 10;

/** A held drag decides at this fraction of the axis it travels along… */
export const DRAG_FRACTION = 0.14;
/** …between these, so it is neither a twitch on a small phone nor a haul on a tablet. */
export const DRAG_MIN = 44;
export const DRAG_MAX = 72;

export type SwipeOutcome = "positive" | "negative" | "stay";

/** How far a held drag has to go along an axis of this length. */
export function dragThreshold(size: number): number {
    return Math.min(DRAG_MAX, Math.max(DRAG_MIN, size * DRAG_FRACTION));
}

/**
 * Which way a released drag went: "positive" is right or down.
 *
 * A flick is only taken in the direction the finger was still moving. Dragging
 * a card out and bringing it back before letting go is somebody changing their
 * mind, and it should leave the card where it started.
 */
export function decideSwipe(
    offset: number,
    velocity: number,
    size: number,
    flickSpeed = FLICK_SPEED,
): SwipeOutcome {
    const flicked = Math.abs(velocity) >= flickSpeed
        && Math.abs(offset) >= FLICK_MIN_OFFSET
        && Math.sign(velocity) === Math.sign(offset);

    if (flicked)
        return (velocity > 0 ? "positive" : "negative");

    if (Math.abs(offset) >= dragThreshold(size))
        return (offset > 0 ? "positive" : "negative");

    return "stay";
}

/**
 * How strongly a swipe rates the song, 1 to 5.
 *
 * A hard swipe says more than a gentle one, which is how the old feed read it
 * too. The curve is in pixels a millisecond, where 1 is a slow drag and 4 is a
 * flick somebody meant.
 */
export function ratingStrength(speed: number): number {
    const perMs = Math.abs(speed) / 1000;

    if (!Number.isFinite(perMs) || perMs <= 0)
        return 1;

    return Math.min(5, Math.max(1, Math.log(perMs) * 3.6));
}
