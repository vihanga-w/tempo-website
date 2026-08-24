import { useEffect, useRef } from "react";

/**
 * 33⅓ rpm, which is what an LP actually turns at.
 *
 * Two hundred degrees a second. A three minute song is about a hundred
 * revolutions and a five minute one closer to a hundred and seventy — the disc
 * was previously on a nine second loop, roughly 6.7 rpm, so it was turning at a
 * fifth of the speed of the record it was drawn as.
 */
const RPM = 100 / 3;
const DEGREES_PER_MS = (RPM * 360) / 60000;

/**
 * How quickly the platter reaches speed, and how long it coasts down.
 *
 * Not the same number in both directions. A turntable is driven up to speed but
 * nothing drives it back down — it is carried by the weight of the platter — so
 * stopping takes noticeably longer than starting, and matching the two reads as
 * a switch being flipped rather than as something with mass.
 */
const SPIN_UP = 450;
const SPIN_DOWN = 650;

/** Past this much of a gap, catching up would be a blur. Cut instead. */
const SNAP_DEGREES = 720;

/**
 * Turns a record, in step with the track playing on it.
 *
 * The angle is not animated, it is *derived*: where the disc is depends on how
 * far through the song it is, at the speed a real one would be turning. Scrub
 * forward and the record is further round, because it would be.
 *
 * Inertia falls out of that rather than being scripted on top. The displayed
 * angle chases the true one instead of matching it, so when playback pauses the
 * true angle stops advancing and the disc coasts the last of the way into it —
 * and when it resumes, the gap it has to make up is what spins it back up.
 *
 * The angle is written straight to the node. Holding it in state would re-render
 * the whole panel sixty times a second to move one transform.
 */
export function useTurntable(playing: boolean, elapsedMs: number) {
    const ref = useRef<HTMLDivElement>(null);

    // Unbounded, both of them. Wrapping is done once, on the way to the DOM —
    // taking a modulo of either of these would turn a small gap across the 360
    // boundary into an enormous one
    const shown = useRef(0);
    const target = useRef(0);

    const frame = useRef<number>();
    const previous = useRef<number>();

    /*
     * Resynced to the track, but only when it has actually gone somewhere.
     *
     * The target used to be rebuilt from the reported position on every frame,
     * which meant pausing threw away everything the disc had turned since the
     * last report and yanked it back — it stopped dead instead of coasting. It
     * advances itself now, and the reported position is only consulted to catch
     * a seek or a new track, where the jump is far too large to be drift.
     */
    useEffect(() => {
        const authoritative = elapsedMs * DEGREES_PER_MS;

        if (Math.abs(authoritative - target.current) > SNAP_DEGREES)
            target.current = authoritative;
    }, [elapsedMs]);

    useEffect(() => {
        // Somebody who has asked for less movement is not asking for a slower
        // record, they are asking for a still one
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
            return;

        const step = (now: number) => {
            // A backgrounded tab stops serving frames, and the first one back
            // carries the whole gap with it
            const elapsed = Math.min(now - (previous.current ?? now), 64);

            previous.current = now;

            // The record's own position, advancing only while the track does
            if (playing)
                target.current += elapsed * DEGREES_PER_MS;

            const gap = target.current - shown.current;

            // A new track starts its position again from nothing, which is a gap
            // of however far round the last one had got. Winding back through it
            // is not a record changing, it is a record rewinding
            if (Math.abs(gap) > SNAP_DEGREES) {
                shown.current = target.current;
            } else {
                const rate = (playing ? SPIN_UP : SPIN_DOWN);

                shown.current += gap * (1 - Math.exp(-elapsed / rate));
            }

            if (ref.current)
                ref.current.style.transform = `rotate(${shown.current % 360}deg)`;

            frame.current = requestAnimationFrame(step);
        };

        previous.current = undefined;
        frame.current = requestAnimationFrame(step);

        return () => {
            if (frame.current)
                cancelAnimationFrame(frame.current);

            frame.current = undefined;
        };
    }, [playing]);

    return ref;
}
