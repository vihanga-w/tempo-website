import { getSizedImageUrl } from "./sized-img";

/**
 * Whether a mark drawn on a cover should be light or dark.
 *
 * Discover draws two things on the artwork itself: the play button, in the
 * bottom-left corner, and the progress line along the foot. Both were white,
 * and a white sleeve made both vanish — a white glyph on white glass on white.
 *
 * This is what Liquid Glass does on Apple's own platforms: a small glass
 * control flips between a light and a dark appearance with whatever is behind
 * it, and its glyph flips with it, so that it always stands out. Large glass
 * does not flip, because a big surface changing over is distracting, but a
 * button is small. The web view has no way to see what is behind an element,
 * so the cover is read once, where the controls sit, and the answer kept.
 */

export type Backdrop = "light" | "dark";

export interface CoverTones {
    /** Behind the play button, in the bottom-left corner. */
    corner: Backdrop;
    /** Along the foot of the sleeve, where the progress line runs. */
    foot: Backdrop;
}

/** WCAG relative luminance of an sRGB colour, 0 to 1. */
export function relativeLuminance(r: number, g: number, b: number): number {
    const linear = (channel: number) => {
        const v = channel / 255;

        return (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    };

    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Above this, a white mark no longer clears 3:1 against its backdrop — WCAG's
 * minimum for the glyph on a control: (1 + 0.05) / 3 - 0.05 = 0.3.
 *
 * A near-black mark clears 3:1 against anything above about 0.11, so between
 * the two either would do, and the line is drawn where white stops working
 * rather than where black starts.
 */
export const LIGHT_BACKDROP = 0.3;

/**
 * The backdrop a region presents to a mark on it.
 *
 * Judged on its brighter pixels rather than its mean. A white glyph on a sleeve
 * that is mostly dark but has a white patch is lost over the patch, and the mean
 * of the two says "dark" with total confidence. The upper quartile is the part
 * of the region a light mark has to beat.
 */
export function backdropOf(luminances: readonly number[], percentile = 0.75): Backdrop {
    if (luminances.length === 0)
        return "dark";

    const sorted = [...luminances].sort((a, b) => a - b);
    const at = sorted[Math.min(sorted.length - 1, Math.floor(percentile * sorted.length))];

    return (at > LIGHT_BACKDROP ? "light" : "dark");
}

type Region = { x0: number; x1: number; y0: number; y1: number };

/**
 * Where the controls sit on the sleeve, as fractions of its side.
 *
 * The corner is larger than the button: glass blurs what is around it into
 * itself, so what it shows is the neighbourhood, not only the pixels beneath.
 */
export const REGIONS: Readonly<Record<keyof CoverTones, Region>> = {
    corner: { x0: 0, x1: 0.26, y0: 0.7, y1: 1 },
    foot: { x0: 0, x1: 1, y0: 0.95, y1: 1 },
};

/** The luminance of every opaque pixel in a region of a square RGBA image. */
export function regionLuminances(pixels: Uint8ClampedArray, size: number, region: Region): number[] {
    const out: number[] = [];

    const x0 = Math.floor(region.x0 * size);
    const x1 = Math.ceil(region.x1 * size);
    const y0 = Math.floor(region.y0 * size);
    const y1 = Math.ceil(region.y1 * size);

    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = (y * size + x) * 4;

            if (pixels[i + 3] < 128)
                continue;

            out.push(relativeLuminance(pixels[i], pixels[i + 1], pixels[i + 2]));
        }
    }

    return out;
}

/** The same small variant artwork-colour.ts reads, so it is usually already cached. */
const SAMPLE_SIZE = 96;

function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
        const img = new Image();

        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/** How the parts of a cover under Discover's controls read, or null if it cannot be read. */
export async function readCoverTones(src: string): Promise<CoverTones | null> {
    const sized = getSizedImageUrl(src, SAMPLE_SIZE, SAMPLE_SIZE);
    const image = (await loadImage(sized)) ?? (sized === src ? null : await loadImage(src));

    if (!image)
        return null;

    const canvas = document.createElement("canvas");

    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (!ctx)
        return null;

    ctx.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    let pixels: Uint8ClampedArray;

    try {
        pixels = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    } catch {
        // Tainted by a cover served without CORS; the controls keep their default
        return null;
    }

    return {
        corner: backdropOf(regionLuminances(pixels, SAMPLE_SIZE, REGIONS.corner)),
        foot: backdropOf(regionLuminances(pixels, SAMPLE_SIZE, REGIONS.foot)),
    };
}
