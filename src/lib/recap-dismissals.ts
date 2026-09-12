import { RECAP_DISMISSED_KEY, RECAP_DISMISSED_TTL } from "./const";
import { getCachedObject, setCachedObject } from "./client-cache";

/**
 * The recaps put away on this device: recap id, and when it was dismissed.
 *
 * Closing a recap tells the server it has been seen, and the shell reopens any
 * recap the server still calls unseen - over the whole interface, every thirty
 * seconds and at every launch, with the close button the only way out. So when
 * that mark did not land, nobody could put their own recap away. This is the
 * record that makes closing one stick regardless.
 */
export type RecapDismissals = Record<string, number>;

/**
 * The record without the recaps that can no longer be offered.
 *
 * The server stops serving a recap a week after it became available, so a
 * dismissal older than that suppresses nothing. Each one is dropped by its own
 * time rather than the record's: it is all kept under a single cache entry,
 * whose age every write refreshes, so nothing in it would ever expire on its
 * own.
 */
export function pruneRecapDismissals(
    dismissals: RecapDismissals,
    now: number = Date.now(),
): RecapDismissals {
    return Object.fromEntries(
        Object.entries(dismissals).filter(([, at]) => now - at <= RECAP_DISMISSED_TTL)
    );
}

/** The record with these recaps added to it, and the expired ones gone. */
export function withRecapsDismissed(
    dismissals: RecapDismissals,
    recapIds: string[],
    now: number = Date.now(),
): RecapDismissals {
    const next: RecapDismissals = { ...dismissals };

    recapIds.forEach(id => { next[id] = now });

    return pruneRecapDismissals(next, now);
}

/**
 * What this device has already put away.
 *
 * An unreadable record reads as an empty one: a recap offered twice is a far
 * smaller thing than a launch that throws on the way up.
 */
export function readRecapDismissals(): RecapDismissals {
    try {
        return getCachedObject<RecapDismissals>(RECAP_DISMISSED_KEY, RECAP_DISMISSED_TTL) ?? {};
    } catch (ex) {
        console.warn("Could not read the recaps already dismissed here, error:", ex);

        return {};
    }
}

/**
 * Write the record back, and say whether it was kept.
 *
 * Storage can refuse - a private window, a full quota - and this runs on the
 * way out of a drawer that covers the screen, where a throw would be the close
 * button failing again for a new reason. The caller holds the record in memory
 * too, so a false here costs the dismissal only at the next launch.
 */
export function writeRecapDismissals(dismissals: RecapDismissals): boolean {
    try {
        setCachedObject(RECAP_DISMISSED_KEY, dismissals);

        return true;
    } catch (ex) {
        console.warn("Could not record the recaps dismissed here, error:", ex);

        return false;
    }
}
