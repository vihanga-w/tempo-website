"use client";

/**
 * A colour halo that drifts along the top edge of a glass control.
 *
 * On a song's profile the top of the page is a slow wash of the record's own
 * colours, orbiting. The floating controls pick that up: a thin line of the same
 * colours runs around their rim, turning slowly, and a soft bloom of it rises
 * off the top edge — as though the glass were catching the light of the page
 * above it. It shows only across the top, fading out down the sides, because
 * that is where the light is coming from.
 *
 * The technique is Jakub Antalik's border-beam (MIT), which Quincy uses for its
 * input: a conic gradient behind a mask that keeps only a ring the width of the
 * padding — the content box cut out of the border box. Two changes. The mask
 * gains a third layer, a top-to-bottom fade intersected with the ring, so the
 * colour stays up top. And the gradient turns by rotating a layer rather than
 * animating a registered angle property: a transform runs on the compositor
 * with nothing repainted, and needs no @property, which older iOS lacks. The
 * mask is gradients only — never an image rebuilt per frame, which WebKit
 * decodes late and treats as transparent in the meantime.
 */

import { Box } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

/**
 * The palette as one loop around a conic gradient, closing on its first colour
 * so the seam never shows as it turns.
 */
export function haloStops(colours: readonly string[]): string {
    const loop = [...colours, colours[0]];
    return loop
        .map((colour, i) => `${colour} ${Math.round((i / (loop.length - 1)) * 360)}deg`)
        .join(", ");
}

/**
 * Three mask layers, composited from the bottom up: the whole box; the content
 * box, excluded from it, leaving a ring; and a fade from the top, intersected
 * with that ring, so it is bright across the top and gone down the sides.
 */
export const HALO_MASK = [
    "linear-gradient(to bottom, #000 0%, rgba(0,0,0,0.3) 30%, transparent 56%)",
    "linear-gradient(#000 0 0) content-box",
    "linear-gradient(#000 0 0)",
].join(", ");

/** How long one turn of the colours takes. Slow, like the wash it echoes. */
const HALO_TURN_S = 14;

/**
 * How strongly each part is drawn. Faint on purpose: this is the glass
 * catching the colour of the page above it, not a light of its own, and the
 * first version — strong enough to notice from across a room — read as an
 * effect laid on the button rather than a reflection in it.
 */
export const HALO_LINE_OPACITY = 0.35;
export const HALO_BLOOM_OPACITY = 0.2;

const turn = keyframes`
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to   { transform: translate(-50%, -50%) rotate(360deg); }
`;

/** The turning colour, masked to a ring `ring` wide at `inset` from the edge. */
function Ring({ colours, inset, ring }: { colours: readonly string[]; inset: string; ring: string }) {
    return (
        <Box
            position="absolute"
            inset={inset}
            borderRadius="inherit"
            overflow="hidden"
            padding={ring}
            style={{
                WebkitMask: HALO_MASK,
                mask: HALO_MASK,
                WebkitMaskComposite: "source-in, xor",
                maskComposite: "intersect, exclude",
            }}
        >
            {/*
              * A square several times the control's size, centred on it, so the
              * gradient still covers every corner at every angle as it turns.
              */}
            <Box
                position="absolute"
                left="50%"
                top="50%"
                width="300%"
                style={{
                    aspectRatio: "1 / 1",
                    background: `conic-gradient(${haloStops(colours)})`,
                    transform: "translate(-50%, -50%)",
                }}
                animation={`${turn} ${HALO_TURN_S}s linear infinite`}
                sx={{ "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}
            />
        </Box>
    );
}

export function GlassHalo({ colours }: Readonly<{ colours: readonly string[] }>) {
    return (
        <Box position="absolute" inset="0" borderRadius="inherit" pointerEvents="none" data-halo="true">
            {/*
              * The bloom: a wider ring, blurred into a glow that rises off the
              * edge. The blur is on a wrapper around the mask rather than on the
              * masked layer itself — filters run before masks, so a blur on the
              * masked layer would be cut straight back to a hard ring.
              */}
            <Box position="absolute" inset="0" borderRadius="inherit" opacity={HALO_BLOOM_OPACITY} style={{ filter: "blur(8px)" }}>
                <Ring colours={colours} inset="-2px" ring="2px" />
            </Box>

            {/* The line itself, crisp, on the rim. */}
            <Box position="absolute" inset="0" borderRadius="inherit" opacity={HALO_LINE_OPACITY}>
                <Ring colours={colours} inset="-1px" ring="1px" />
            </Box>
        </Box>
    );
}
