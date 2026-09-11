import type { BoxProps } from "@chakra-ui/react";

/**
 * Liquid glass, as close as a web view gets to it.
 *
 * Apple's material refracts what sits behind it: the backdrop is bent through
 * the edge of the lens, not merely blurred by it. A WKWebView gives us
 * `backdrop-filter` and nothing more — Safari will not accept an SVG
 * displacement map there, so the bending is not available to us at any price.
 *
 * So the depth here is drawn rather than simulated. A blurred, over-saturated
 * backdrop stands in for the body of the material; a bright inset rim along the
 * top edge for the specular highlight where light catches it; a fainter one
 * along the bottom for the light coming back up off the page; and an outer
 * shadow to lift the whole thing off what it is covering. Over the near-black
 * the app is set on, that reads as glass.
 *
 * Kept in one place because the illusion only holds while every surface agrees
 * on it — a panel blurred a little differently reads as a mistake rather than
 * as a second material.
 */

export type GlassTier = "thin" | "regular" | "thick";

type TierSpec = {
    /** Backdrop blur radius. Larger reads as thicker, and costs more to composite. */
    blur: number;
    /** Fill at the lit edge and at the far one; the gradient between is the body. */
    fillNear: number;
    fillFar: number;
    /** Brightness of the specular rim along the top edge. */
    rim: number;
};

const TIERS: Record<GlassTier, TierSpec> = {
    /** For wide chrome, where a heavy blur would swallow the page underneath. */
    thin: { blur: 12, fillNear: 0.07, fillFar: 0.02, rim: 0.3 },
    /** The default: controls, pills, anything the thumb lands on. */
    regular: { blur: 22, fillNear: 0.13, fillFar: 0.05, rim: 0.45 },
    /** For a surface that has to carry text over busy artwork. */
    thick: { blur: 34, fillNear: 0.2, fillFar: 0.09, rim: 0.55 },
};

/**
 * Saturating the backdrop is what separates this from plain frosting: colour
 * from whatever is behind bleeds through and tints the material, so a glass
 * button over album art picks the art up instead of staying grey.
 */
const BACKDROP = (blur: number) =>
    `blur(${blur}px) saturate(180%) brightness(1.08)`;

/**
 * The material's backdrop on its own, for chrome that is a scrim rather than a
 * surface — a top bar has no rim to catch the light and casts no shadow, but it
 * has to be blurring the page to the same recipe as everything else or the two
 * read as different glass.
 */
export function glassBackdrop(tier: GlassTier = "regular"): string {
    return BACKDROP(TIERS[tier].blur);
}

/**
 * A colour for the glass to take on, as its channels, or null if it cannot be
 * read — in which case the glass simply stays clear rather than guessing.
 */
export function parseColour(colour: string | undefined): [number, number, number] | null {
    if (!colour)
        return null;

    const c = colour.trim();
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);

    if (hex) {
        const h = hex[1].length === 3 ? [...hex[1]].map((ch) => ch + ch).join("") : hex[1];
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }

    const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);

    if (rgb) {
        const channel = (v: string) => Math.round(Math.min(255, Math.max(0, Number(v))));
        return [channel(rgb[1]), channel(rgb[2]), channel(rgb[3])];
    }

    return null;
}

/** A colour at an opacity, or fully transparent when there is no colour. */
const rgba = (c: [number, number, number] | null, a: number) =>
    c ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : "rgba(255,255,255,0)";

/*
 * How strongly the glass takes on the page's colour, part by part. Well short
 * of opaque everywhere: this is a reflection, not a paint job, and the glass
 * has to stay readable as glass over whatever the colour happens to be.
 */
/** A wash through the body. */
const TINT_FILL = 0.14;
/** A thin line of it around the edge, where glass catches colour most. */
const TINT_EDGE = 0.28;
/** The page's colour bounced up into the lower edge, as light off a surface would be. */
const TINT_BOUNCE = 0.45;
/** A faint halo of it around the outside. */
const TINT_HALO = 0.35;

/**
 * What a glass surface animates when its colour changes, for elements to add
 * to their own transitions. Only colour and shadow are listed, and the tint
 * lives in exactly those: a gradient cannot be interpolated, so a tint carried
 * in one would snap from page to page instead of passing.
 */
export const GLASS_TRANSITION = "background-color .45s ease, box-shadow .45s ease";

export function glassSurface({
    tier = "regular",
    radius = "9999px",
    tint,
}: {
    tier?: GlassTier;
    /** Any Chakra radius. Circles are the default because the controls are round. */
    radius?: BoxProps["borderRadius"];
    /**
     * The colour of what the glass sits among — the page's own colour — for it
     * to reflect. A web view cannot bend the light behind glass the way the
     * real material does, and behind these controls is mostly near-black, so
     * left alone the glass reads as grey; this is what gives it the room's
     * colour instead. Any hex or rgb() colour; anything else leaves it clear.
     */
    tint?: string;
} = {}): BoxProps {
    const { blur, fillNear, fillFar, rim } = TIERS[tier];
    const colour = parseColour(tint);

    return {
        borderRadius: radius,
        // The page's colour, beneath the sheen.
        backgroundColor: rgba(colour, TINT_FILL),
        backdropFilter: BACKDROP(blur),
        style: {
            /*
             * Emotion prefixes the shorthand, but the property is still behind
             * the prefix in the WebKit that ships in the older iOS this build
             * targets, so it is written out rather than trusted to the prefixer.
             */
            WebkitBackdropFilter: BACKDROP(blur),
            /*
             * The sheen: white light over the colour. Inline rather than as a
             * Chakra prop, because Chakra runs backgroundImage through its own
             * gradient parser, which reads the angle in a standard CSS gradient
             * as a colour token — it threw without a theme, and could mangle
             * the gradient with one.
             */
            backgroundImage: `linear-gradient(150deg, rgba(255,255,255,${fillNear}) 0%, rgba(255,255,255,${fillFar}) 100%)`,
        },
        /*
         * The same number of shadows whether or not there is a colour —
         * transparent where there is none — so moving between a tinted page and
         * a clear one animates rather than jumping.
         */
        boxShadow: [
            // The specular highlight: a lit rim along the top edge.
            `inset 0 1px 0.5px rgba(255,255,255,${rim})`,
            // The body's own edge, all the way round, so the shape stays legible.
            `inset 0 0 0 0.5px rgba(255,255,255,0.14)`,
            // Light returning off the page below.
            `inset 0 -1px 0.5px rgba(255,255,255,0.07)`,
            // The page's colour, caught along the edge…
            `inset 0 0 0 1px ${rgba(colour, TINT_EDGE)}`,
            // …and bounced up into the lower half.
            `inset 0 -6px 12px -6px ${rgba(colour, TINT_BOUNCE)}`,
            // The shadow that lifts it off whatever it covers.
            `0 12px 32px -8px rgba(0,0,0,0.6)`,
            `0 2px 8px -2px rgba(0,0,0,0.4)`,
            // And a faint halo of the page's colour around it.
            `0 0 22px -6px ${rgba(colour, TINT_HALO)}`,
        ].join(", "),
    };
}

/**
 * What a glass control does under a finger.
 *
 * Glass has no ink to darken, so a press is read off the material instead: it
 * compresses slightly and the fill brightens, as though pushed closer to what
 * is behind it.
 */
export const glassPress: BoxProps["_active"] = {
    transform: "scale(0.93)",
    filter: "brightness(1.25)",
};
