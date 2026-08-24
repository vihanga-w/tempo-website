import { RefObject, useEffect, useRef } from "react";

/**
 * Fades an element out as the page scrolls away from the top.
 *
 * The wash is fixed to the viewport, which is right while somebody is looking at
 * the top of the page and wrong the moment they are not: everything below the
 * header was drawn to sit on a near black page, and scrolling slides it under a
 * field of colour instead. Track titles lose their contrast and the buttons
 * pinned to the top corner end up on whatever part of the cover happens to be
 * passing behind them.
 *
 * So the wash stays fixed, and stops existing once the header it belongs to has
 * gone. The alternative — letting it scroll away with the content — gives the
 * same contrast for free, but it takes the status bar's colour with it and
 * leaves a tinted bar sitting above an untinted page.
 *
 * Written straight to the node. This runs on every scroll frame, and a state
 * update here would re-render the profile for the length of a flick.
 */
export function useScrollFade(ref: RefObject<HTMLElement>, distance: number) {
    const frame = useRef<number>();

    useEffect(() => {
        const scroller = document.querySelector<HTMLElement>("[data-profile-scroll-container]");

        if (!scroller)
            return;

        const apply = () => {
            frame.current = undefined;

            if (!ref.current)
                return;

            const travelled = Math.min(Math.max(scroller.scrollTop, 0), distance);

            // Eased rather than linear, so the wash holds while the header is
            // still mostly on screen and then goes, instead of thinning out from
            // the first pixel of scroll
            const remaining = 1 - travelled / distance;

            ref.current.style.opacity = `${(remaining * remaining).toFixed(3)}`;
        };

        const onScroll = () => {
            // Coalesced to one write a frame: scroll events can outpace paint
            if (frame.current === undefined)
                frame.current = requestAnimationFrame(apply);
        };

        apply();
        scroller.addEventListener("scroll", onScroll, { passive: true });

        return () => {
            scroller.removeEventListener("scroll", onScroll);

            if (frame.current !== undefined)
                cancelAnimationFrame(frame.current);
        };
    }, [ref, distance]);
}
