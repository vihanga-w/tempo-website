import { RefObject, useCallback, useLayoutEffect } from "react";

/**
 * Shrinks a single line of text until it fits the width it has been given.
 *
 * The profile's figures are set at a size chosen for a typical reading — "4h
 * 12m". A hundred-hour week is two glyphs longer than that and, left alone,
 * either spills out of its tile or drags the tile wider. A fixed step down per
 * glyph was the first attempt and it does not survive a breakpoint: the size
 * and the tile it has to fit inside do not grow at quite the same rate, so a
 * ratio tuned on one screen clips on another.
 *
 * Measuring instead means the figure is only ever as small as it has to be.
 * The element is returned to its stylesheet size first so the measurement is of
 * the size it wants to be, not of whatever this hook last left behind — without
 * that it ratchets downwards on every call and never recovers.
 */
export function useFitText(
    ref: RefObject<HTMLElement>,
    probeRef: RefObject<HTMLElement>,
    text: string,
) {
    const fit = useCallback(() => {
        const el = ref.current;
        const probe = probeRef.current;

        if (!el || !probe)
            return;

        el.style.fontSize = "";

        const base = parseFloat(getComputedStyle(el).fontSize);
        const parent = el.parentElement;

        if (!parent)
            return;

        /*
         * The room comes from the parent, not from the element itself. These
         * figures sit in a flex column aligned to the start, which sizes them
         * to their own content — so asking the element how wide it is returns
         * the width of the text, and every shrink reports less room than the
         * last. Measured that way it ratchets down to nothing.
         */
        const style = getComputedStyle(parent);
        const available = parent.clientWidth
            - parseFloat(style.paddingLeft)
            - parseFloat(style.paddingRight);

        /*
         * Measured off the probe, not off the element itself. A figure that is
         * still counting up is showing "1m" when this first runs — which fits
         * comfortably, so measuring what is on screen concludes there is
         * nothing to do and never looks again. The probe carries the reading
         * the count is heading for, at the same size, so the answer is right
         * the first time.
         */
        const natural = probe.scrollWidth;

        if (!base || !available || natural <= available)
            return;

        // Floor, not round: rounding up can leave it a fraction of a pixel wide
        // and still clipped, which is the one outcome this exists to prevent.
        el.style.fontSize = `${Math.floor(base * (available / natural))}px`;
    }, [ref, probeRef, text]);

    useLayoutEffect(() => {
        fit();

        // The text is not the only thing that decides whether it fits — a
        // rotation or a resized window changes the room it has without changing
        // a character of it.
        let lastWidth = -1;

        const observer = new ResizeObserver(entries => {
            const width = entries[0]?.contentRect.width ?? -1;

            // Shrinking the figure changes its height, which reaches this
            // observer as a resize and would call the fit straight back.
            if (width === lastWidth)
                return;

            lastWidth = width;
            fit();
        });

        if (ref.current?.parentElement)
            observer.observe(ref.current.parentElement);

        // Web fonts land after first paint, and Inter is materially wider than
        // the fallback it replaces, so a figure measured against the fallback
        // fits until the moment it does not.
        document.fonts?.ready.then(fit).catch(() => {});

        return () => observer.disconnect();
    }, [fit, text, ref]);
}
