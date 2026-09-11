import { getSizedImageUrl } from "./sized-img";

/**
 * A cover's pixels, read once.
 *
 * Three things want the same small copy of a sleeve: the accent, the palette,
 * and whether the controls drawn on it should be light or dark. Each used to
 * fetch, decode and read its own copy, so a card cost three decodes and three
 * canvas reads — and all of it landed exactly as the card arrived, which is
 * the one moment there is nothing to spare.
 *
 * So one read per cover, kept. The last dozen are held, which covers the
 * runway ahead and the few cards behind that scrolling back reaches.
 */

/**
 * How big a sample to take, and — because it is passed to the image endpoint —
 * how big an image to ask for.
 *
 * 96 is a size the endpoint already serves, so it is known to be allowed, and
 * the sample is drawn at 1:1 with no resampling on the way in. The colour bins
 * are 32 levels a channel; more pixels than this only slow the read down
 * without moving the answer.
 */
export const COVER_SAMPLE = 96;

/** How many covers' pixels to keep. Each is about 36KB at 96 square. */
export const COVERS_KEPT = 12;

export interface CoverPixels {
    /** RGBA, four bytes a pixel, row by row. */
    data: Uint8ClampedArray;
    size: number;
}

export type PixelLoader = (src: string, size: number) => Promise<CoverPixels | null>;

function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
        const img = new Image();

        // Set before src, or the request goes out without the CORS mode and the
        // canvas is tainted by the time anything can be read back off it
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/** Draws a cover into a canvas and reads it back. Null for anything it cannot read. */
export const drawAndRead: PixelLoader = async (src, size) => {
    const sized = getSizedImageUrl(src, size, size);

    // Falling back to the original covers the endpoint refusing the size or
    // being unreachable: a page that keeps its colour beats one that loses it
    const image = (await loadImage(sized)) ?? (sized === src ? null : await loadImage(src));

    if (!image)
        return null;

    const canvas = document.createElement("canvas");

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (!ctx)
        return null;

    ctx.drawImage(image, 0, 0, size, size);

    try {
        return { data: ctx.getImageData(0, 0, size, size).data, size };
    } catch {
        // A cover served without CORS headers taints the canvas. Nothing to be
        // done about it here, and it is not worth an error — whatever is reading
        // simply keeps what it already had
        return null;
    }
};

const held = new Map<string, Promise<CoverPixels | null>>();

/**
 * One cover's pixels, from the cache when it has been read before.
 *
 * The promise is cached rather than the result, so two readers asking at the
 * same moment — which is exactly what the accent and the palette do — share
 * one decode instead of racing.
 */
export function readCoverPixels(
    src: string,
    { size = COVER_SAMPLE, load = drawAndRead }: { size?: number; load?: PixelLoader } = {},
): Promise<CoverPixels | null> {
    const key = `${size}:${src}`;
    const hit = held.get(key);

    if (hit) {
        // Re-inserted, so what is being looked at is the last to be dropped
        held.delete(key);
        held.set(key, hit);

        return hit;
    }

    const pending = load(src, size);

    held.set(key, pending);

    while (held.size > COVERS_KEPT) {
        const oldest = held.keys().next().value;

        if (oldest === undefined)
            break;

        held.delete(oldest);
    }

    return pending;
}

/** How many covers are held, for a test to look at. */
export function coversHeld(): number {
    return held.size;
}

export function forgetCovers(): void {
    held.clear();
}
