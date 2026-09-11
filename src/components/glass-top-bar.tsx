"use client";

import { Box } from "@chakra-ui/react";
import { glassBackdrop } from "@/lib/liquid-glass";

/**
 * The glass at the top of every page, behind the title.
 *
 * Two layers rather than one, cross-faded. The resting layer is tinted dark
 * enough to hold the title against whatever scrolls under it; the scrolled
 * layer is much fainter, because by then the page has content moving beneath
 * it and the tint would read as a smear rather than as a surface.
 *
 * Its own component so the benches can put the real chrome over the real pages
 * instead of a copy of it — a replica drifts, and the whole point of looking is
 * to see what ships.
 */
export function GlassTopBar({
    scrolled,
}: Readonly<{
    /** True once the page beneath has been scrolled off its top. */
    scrolled?: boolean;
}>) {
    return (
        <>
            <Box
                width="100vw"
                height="calc(85px + env(safe-area-inset-top, 0px))"
                pos="fixed"
                top="0"
                left="0"
                opacity={scrolled ? "0" : "1"}
                /*
                 * Was opaque near-black down to 15%, which cut the page off in
                 * a hard line under the title. It is now tinted glass: dark
                 * enough to hold the title against anything, but the page
                 * carries on behind it, blurred, instead of stopping.
                 */
                background="linear-gradient(180deg,rgba(13, 13, 14, 0.82) 0%, rgba(13,13,14,0.55) 45%, rgba(13,13,14,0) 100%)"
                backdropFilter={glassBackdrop("thick")}
                style={{
                    WebkitBackdropFilter: glassBackdrop("thick"),
                    /*
                     * The blur is masked out along with the tint. Without this
                     * the blurred region ends in a straight edge of its own, a
                     * few pixels below where the tint has finished fading —
                     * which is more obvious than the hard gradient it replaced.
                     */
                    WebkitMask: "linear-gradient(180deg,rgb(0,0,0) 55%, rgba(0,0,0,0) 100%)",
                    mask: "linear-gradient(180deg,rgb(0,0,0) 55%, rgba(0,0,0,0) 100%)",
                }}
                zIndex="999"
                pointerEvents="none"
                transition=".3s"
            />

            <Box
                width="100vw"
                height="calc(75px + env(safe-area-inset-top, 0px))"
                pos="fixed"
                top="0"
                left="0"
                opacity={!scrolled ? "0" : "1"}
                style={{
                    WebkitMask: "linear-gradient(180deg,rgb(0,0,0) 25%, rgba(0,0,0,0) 100%)",
                    mask: "linear-gradient(180deg,rgb(0,0,0) 25%, rgba(0,0,0,0) 100%)",
                    WebkitBackdropFilter: glassBackdrop("thin"),
                }}
                background="linear-gradient(180deg,rgba(13, 13, 14, 0.2) 0%, rgba(13,13,14,0) 100%)"
                backdropFilter={glassBackdrop("thin")}
                zIndex="999"
                pointerEvents="none"
                transition=".3s"
            />
        </>
    );
}
