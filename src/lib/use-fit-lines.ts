import { RefObject, useCallback, useEffect } from "react";

/**
 * Steps a clamped block of text down a size or two when it does not fit.
 *
 * A long song title is clamped to two lines and cut with an ellipsis. Dropping
 * the type a little often buys the rest of a word — sometimes the rest of the
 * title — and a title a shade smaller reads better than a title with its end
 * missing.
 *
 * The candidates are tried against a probe rather than against the element, and
 * the probe is not clamped: the whole point is to find out how tall the text
 * *would* be, which a clamped element can never say, because it always reports
 * exactly the height it was told to be.
 *
 * Only ever steps down, and only through the sizes it is given, so a title can
 * never end up at some arbitrary fractional size that matches nothing else on
 * the panel.
 */
export function useFitLines(
    ref: RefObject<HTMLElement>,
    probeRef: RefObject<HTMLElement>,
    text: string,
    maxLines: number,
    sizes: readonly number[],
) {
    const fit = useCallback(() => {
        const el = ref.current;
        const probe = probeRef.current;

        if (!el || !probe || sizes.length === 0)
            return;

        // The width does not move with the size: this sits in a flex row where
        // the space is decided by everything else on it, so it can be measured
        // once and every candidate tried against it
        const available = el.clientWidth;

        if (!available)
            return;

        probe.style.width = `${available}px`;

        const chosen = sizes.find(size => {
            probe.style.fontSize = `${size}px`;

            const lineHeight = parseFloat(getComputedStyle(probe).lineHeight);

            // Half a line of tolerance, so a block that lands a rounding error
            // over the limit is not knocked down a size for nothing
            return probe.scrollHeight <= lineHeight * maxLines + lineHeight * 0.5;
        });

        el.style.fontSize = `${chosen ?? sizes[sizes.length - 1]}px`;
    }, [ref, probeRef, maxLines, sizes]);

    useEffect(() => {
        fit();

        const observer = new ResizeObserver(fit);

        if (ref.current?.parentElement)
            observer.observe(ref.current.parentElement);

        document.fonts?.ready.then(fit).catch(() => {});

        return () => observer.disconnect();
    }, [fit, text, ref]);
}
