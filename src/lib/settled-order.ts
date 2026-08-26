/**
 * Keeping a list from rearranging itself faster than anyone can read it.
 *
 * The now-playing cards are ordered by whoever changed track most recently,
 * which is the right thing to show and the wrong thing to apply the instant it
 * happens: a friend flicking through a playlist changes track every few
 * seconds, and the cards would spend the evening swapping places.
 *
 * Deliberately not a debounce. Waiting for things to go quiet sounds right and
 * starves - the friend doing the skipping is precisely the one who never goes
 * quiet, so the order would freeze for as long as they kept going and then
 * lurch when they stopped. This is a floor on how often the order may move
 * instead: a burst collapses into one movement, and the list is never more
 * than that floor behind the truth.
 */

/** Whether two lists hold the same members, in any order. */
function sameMembers(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length)
        return false;

    const seen = new Set(b);

    return a.every(v => seen.has(v));
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
    return (a.length === b.length && a.every((v, i) => v === b[i]));
}

export interface SettleDecision {
    /** The order to render. */
    order: string[];
    /** When to look again, in ms, or null if there is nothing waiting. */
    retryIn: number | null;
}

/**
 * Decides what order to show, given what is wanted and when the list last moved.
 *
 * Membership changes are never held back. A friend who has stopped listening
 * has to leave immediately - holding them would leave a card claiming somebody
 * is playing something they are not - and one who has just started is news
 * worth the movement. Only a reshuffle of the same people is made to wait.
 *
 * @param quietMs the floor: the least time between two rearrangements.
 */
export function settleOrder(
    current: readonly string[],
    desired: readonly string[],
    lastMovedAt: number,
    now: number,
    quietMs: number,
): SettleDecision {
    // Somebody joined or left. Not a reshuffle, and not held.
    if (!sameMembers(current, desired))
        return { order: [...desired], retryIn: null };

    if (sameOrder(current, desired))
        return { order: [...current], retryIn: null };

    const waited = now - lastMovedAt;

    if (waited >= quietMs)
        return { order: [...desired], retryIn: null };

    // Hold, and say when this is worth asking again
    return { order: [...current], retryIn: quietMs - waited };
}

/**
 * The least time between two rearrangements of the now-playing cards.
 *
 * Long enough that a friend skipping through a playlist moves the cards once
 * rather than once a track, short enough that a single friend changing song is
 * still reflected while it is worth knowing.
 */
export const REORDER_FLOOR_MS = 5000;
