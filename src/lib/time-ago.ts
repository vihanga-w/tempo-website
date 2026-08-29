/**
 * "2h ago", for a timestamp a person is meant to read at a glance.
 *
 * Deliberately coarse. A Discover card says when a friend played something so
 * the listener knows whether it is current, not so they can time it — "3m ago"
 * and "4m ago" mean the same thing to a reader, and a card that ticks between
 * them is just noise.
 */
export function timeAgo(at: number, now = Date.now()): string {
    const seconds = Math.round((now - at) / 1000);

    // Clock skew between a friend's device and this one can put a play slightly
    // in the future. "in 4 seconds" is worse than saying it just happened.
    if (seconds < 60)
        return "just now";

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60)
        return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);

    if (hours < 24)
        return `${hours}h ago`;

    const days = Math.floor(hours / 24);

    return days === 1 ? "yesterday" : `${days}d ago`;
}
