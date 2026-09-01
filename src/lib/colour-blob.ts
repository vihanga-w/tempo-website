/**
 * Turning an account's colour blob into something the page can draw.
 *
 * The server sends a profile picture reduced to a 4x4 grid of colours — see
 * profile-blob.ts on the API. This turns those sixteen colours into a CSS
 * background: four soft radial gradients, one per corner, over the average of
 * the whole picture.
 *
 * A canvas would be the obvious way to do this, and was the first way it was
 * done. It cannot be: turning the blob into an image needs a document, so on the
 * server it produces nothing, the markup ships with the empty placeholder in it,
 * and React keeps that markup through hydration — so the blob never appeared on
 * a cold load, only on client-side navigations. Built as a string it is the same
 * on both sides and is right in the very first paint, which is the one that
 * matters here.
 *
 * Four corners rather than all sixteen because the gradients overlap into each
 * other. What comes out is a smooth blend in roughly the shape of the picture,
 * which is what a picture looks like out of focus.
 */

import { decode as decodeBlurHash, isBlurhashValid } from "blurhash";

import { rgbaToPngDataUrl } from "./tiny-png";

const GRID = 4;
const BYTES = GRID * GRID * 3;

/** 48 bytes of base64, which is what the server sends and nothing else. */
const BLOB_PATTERN = /^[A-Za-z0-9+/]{64}$/;

/** The same few accounts are drawn over and over as lists re-render. */
const built = new Map<string, string>();

/**
 * How wide the BlurHash is decoded before being drawn.
 *
 * A four by four hash holds sixteen wave components, so there is nothing past
 * about this size to recover — and the browser smooths it on the way up, which
 * is the blur. Larger only costs bytes in the markup: twenty square comes to
 * roughly two kilobytes as a data URI, thirty two to five and a half.
 */
const BLURHASH_DECODE = 20;

/** Decoded hashes, for the same reason as above. */
const hashed = new Map<string, string>();

/**
 * A CSS background from a BlurHash.
 *
 * Kept beside the colour blob rather than replacing it: an app already on
 * somebody's phone only understands the blob, so the server sends both until
 * the recorded client versions say nobody needs the older one. See
 * APP_CLIENT_VERSION.
 */
export function blurHashToBackground(hash: string | undefined | null): string | undefined {
    if (!hash)
        return undefined;

    const cached = hashed.get(hash);

    if (cached)
        return cached;

    try {
        if (!isBlurhashValid(hash).result)
            return undefined;

        const pixels = decodeBlurHash(hash, BLURHASH_DECODE, BLURHASH_DECODE);
        const uri = rgbaToPngDataUrl(pixels, BLURHASH_DECODE, BLURHASH_DECODE);

        if (!uri)
            return undefined;

        const background = `url("${uri}")`;

        hashed.set(hash, background);

        return background;
    } catch {
        // A placeholder is never worth throwing over
        return undefined;
    }
}

/**
 * Whichever placeholder this account has, best first.
 *
 * The BlurHash keeps far more of the picture, so it wins wherever it is there;
 * the grid is what accounts resolved by an older server still carry.
 */
export function placeholderBackground(
    hash: string | undefined | null,
    blob: string | undefined | null,
): string | undefined {
    return blurHashToBackground(hash) ?? colourBlobToBackground(blob);
}

/** Decodes base64 without needing a DOM, so this works during SSR too. */
function decodeBase64(value: string): number[] | null {
    const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    const bytes: number[] = [];

    let accumulator = 0;
    let bits = 0;

    for (const character of value) {
        const index = ALPHABET.indexOf(character);

        if (index === -1)
            return null;

        accumulator = (accumulator << 6) | index;
        bits += 6;

        if (bits >= 8) {
            bits -= 8;
            bytes.push((accumulator >> bits) & 0xff);
        }
    }

    return bytes;
}

/**
 * A CSS background for the space a profile picture is about to fill.
 *
 * Returns undefined for anything it cannot read, so callers fall back to
 * whatever they drew before this existed.
 */
export function colourBlobToBackground(blob: string | undefined | null): string | undefined {
    if (!blob || !BLOB_PATTERN.test(blob))
        return undefined;

    const cached = built.get(blob);

    if (cached)
        return cached;

    const bytes = decodeBase64(blob);

    if (!bytes || bytes.length !== BYTES)
        return undefined;

    const at = (row: number, column: number) => {
        const offset = (row * GRID + column) * 3;

        return `rgb(${bytes[offset]},${bytes[offset + 1]},${bytes[offset + 2]})`;
    };

    // The mean of the whole grid, under everything, so the corners have
    // something of the right colour to fade into rather than fading to nothing
    let r = 0;
    let g = 0;
    let b = 0;

    for (let pixel = 0; pixel < GRID * GRID; pixel++) {
        r += bytes[pixel * 3];
        g += bytes[pixel * 3 + 1];
        b += bytes[pixel * 3 + 2];
    }

    const count = GRID * GRID;
    const base = `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`;

    // Placed inside the corners rather than on them, and reaching past halfway,
    // so the four overlap in the middle instead of meeting at a seam
    const background = [
        `radial-gradient(circle at 22% 22%, ${at(0, 0)} 0%, transparent 62%)`,
        `radial-gradient(circle at 78% 22%, ${at(0, GRID - 1)} 0%, transparent 62%)`,
        `radial-gradient(circle at 22% 78%, ${at(GRID - 1, 0)} 0%, transparent 62%)`,
        `radial-gradient(circle at 78% 78%, ${at(GRID - 1, GRID - 1)} 0%, transparent 62%)`,
        `linear-gradient(${base}, ${base})`,
    ].join(", ");

    built.set(blob, background);

    return background;
}
