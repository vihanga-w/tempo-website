import { useEffect, useRef, useState } from "react";

/**
 * Counts a figure up when it first appears.
 *
 * A page that simply renders its numbers reads as a table. Watching a total
 * climb is most of what makes checking it feel like anything, and it costs one
 * animation frame loop.
 *
 * Shared by the leaderboard and the profile, which show the same week of
 * listening and should arrive at it the same way.
 */
export function useCountUp(target: number, durationMs = 900): number {
    const [value, setValue] = useState(0);
    const frame = useRef<number>();

    // Where the last run finished, so a figure that is refreshed while the page
    // is open moves from what it said to what it now says. Counting from zero
    // again reads as the figure having been lost and refetched.
    const from = useRef(0);

    useEffect(() => {
        const start = performance.now();
        const origin = from.current;

        const step = (nowMs: number) => {
            const progress = Math.min(1, (nowMs - start) / durationMs);

            // Eases out, so it arrives rather than stopping dead
            const eased = origin + (target - origin) * (1 - Math.pow(1 - progress, 3));

            from.current = eased;
            setValue(eased);

            if (progress < 1)
                frame.current = requestAnimationFrame(step);
        };

        frame.current = requestAnimationFrame(step);

        return () => {
            if (frame.current)
                cancelAnimationFrame(frame.current);
        };
    }, [target, durationMs]);

    return value;
}
