/**
 * The inset the device reserves at the bottom of the screen, as a number.
 *
 * `--safe-area-inset-bottom` holds `env(safe-area-inset-bottom)`, and a custom
 * property is not resolved until something uses it: read straight off the root
 * element it comes back as the literal text `env(safe-area-inset-bottom, 0px)`,
 * which parses to NaN. So this puts the property to work on a real one —
 * padding, on an element that is never seen — and reads back what the browser
 * computed, which is a length in pixels.
 */

/** What an iPhone with a home indicator reports, for rendering before mount. */
export const ASSUMED_INSET = 34;

export function safeAreaInsetBottom(fallback = 0): number {
    if (typeof window === "undefined" || typeof document === "undefined")
        return fallback;

    const probe = document.createElement("div");

    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.paddingBottom = "var(--safe-area-inset-bottom, 0px)";

    document.body.appendChild(probe);

    try {
        const parsed = parseFloat(getComputedStyle(probe).paddingBottom);

        // A browser with no support for the property computes nothing rather
        // than zero, and anything negative is nonsense we should not reserve
        return (Number.isFinite(parsed) && parsed >= 0) ? parsed : fallback;
    } finally {
        probe.remove();
    }
}
