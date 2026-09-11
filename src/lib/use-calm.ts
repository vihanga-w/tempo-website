import { useEffect, useState } from "react";

/**
 * Whether to run an animation cheaply, because the device is not keeping up.
 *
 * iOS throttles both requestAnimationFrame and CSS animations to 30fps in Low
 * Power Mode, and it says nothing to the page about it. Discover's wash is four
 * blurred copies of a cover drifting under a 46px blur, which has to be redrawn
 * every frame it moves; at half the frame budget that stops being an animation
 * and becomes a stutter that takes the gestures down with it.
 *
 * There is no API for Low Power Mode, so the frame pace is measured instead —
 * which has the advantage of also catching an old phone, a hot one, or a
 * browser doing something expensive elsewhere. "Reduce motion" is honoured as
 * well: somebody who asked for less movement should not be given a drifting
 * page.
 */

/** At or below this many frames a second, run calm. Low Power Mode caps at 30. */
export const CALM_FPS = 40;

/** Frames to let settle after mount before believing anything: the first few carry the page's own layout. */
const WARMUP_FRAMES = 6;
/** Frames to time. About a third of a second at 60fps. */
const SAMPLE_FRAMES = 20;

/** Whether a set of frame intervals, in ms, says the device is behind. */
export function isStruggling(intervals: readonly number[], fps = CALM_FPS): boolean {
    if (intervals.length === 0)
        return false;

    const sorted = [...intervals].sort((a, b) => a - b);
    // The median, so one long frame — a fetch, a decode — does not decide it
    const median = sorted[Math.floor(sorted.length / 2)];

    return median > 1000 / fps;
}

function prefersReducedMotion(): boolean {
    return (typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

/** Times some frames, then says whether they came in slowly. */
function measure(done: (struggling: boolean) => void): () => void {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
        done(false);

        return () => {};
    }

    const intervals: number[] = [];
    let frame = 0;
    let last = 0;
    let handle = 0;

    const tick = (now: number) => {
        frame++;

        if (frame > WARMUP_FRAMES) {
            if (last)
                intervals.push(now - last);

            last = now;
        }

        if (intervals.length >= SAMPLE_FRAMES) {
            done(isStruggling(intervals));

            return;
        }

        handle = window.requestAnimationFrame(tick);
    };

    handle = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(handle);
}

export function useCalm(): boolean {
    const [calm, setCalm] = useState(false);

    useEffect(() => {
        let cancelMeasure: (() => void) | null = null;
        let live = true;

        const decide = () => {
            if (!live)
                return;

            if (prefersReducedMotion()) {
                setCalm(true);

                return;
            }

            cancelMeasure?.();
            cancelMeasure = measure(struggling => {
                if (live)
                    setCalm(struggling);
            });
        };

        decide();

        // Low Power Mode can be switched on while the app is open, and coming
        // back to a backgrounded app is the moment it usually has been
        const onVisible = () => {
            if (document.visibilityState === "visible")
                decide();
        };

        const query = (typeof window.matchMedia === "function"
            ? window.matchMedia("(prefers-reduced-motion: reduce)")
            : null);

        document.addEventListener("visibilitychange", onVisible);
        query?.addEventListener?.("change", decide);

        return () => {
            live = false;
            cancelMeasure?.();
            document.removeEventListener("visibilitychange", onVisible);
            query?.removeEventListener?.("change", decide);
        };
    }, []);

    return calm;
}
