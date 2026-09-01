/**
 * A PNG encoder small enough to inline, with no dependencies and no DOM.
 *
 * BlurHash decodes to raw pixels, and the usual way to get from pixels to
 * something CSS can draw is a canvas. Canvas cannot be used here: it needs a
 * document, so at prerender it produces nothing, the markup ships with an empty
 * placeholder, and React keeps that markup through hydration — which is the
 * exact bug colour-blob.ts documents and was written to avoid. A placeholder
 * that arrives a paint late is a placeholder for nothing.
 *
 * So the pixels are written out as a PNG here instead, in plain arithmetic that
 * runs the same during a build and in a browser.
 *
 * Nothing is compressed. Deflate has a "stored" block type that copies bytes
 * through verbatim, which is legal, is what every decoder already implements,
 * and saves carrying a compressor for an image that is twenty pixels across.
 */

/** Table-driven CRC32, as PNG requires on every chunk. */
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);

    for (let n = 0; n < 256; n++) {
        let c = n;

        for (let k = 0; k < 8; k++)
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);

        table[n] = c >>> 0;
    }

    return table;
})();

function crc32(bytes: Uint8Array): number {
    let c = 0xFFFFFFFF;

    for (let i = 0; i < bytes.length; i++)
        c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);

    return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Adler32, which is what a zlib stream ends with. */
function adler32(bytes: Uint8Array): number {
    let a = 1;
    let b = 0;

    for (let i = 0; i < bytes.length; i++) {
        a = (a + bytes[i]) % 65521;
        b = (b + a) % 65521;
    }

    return (((b << 16) | a) >>> 0);
}

function be32(n: number): number[] {
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function chunk(type: string, data: number[]): number[] {
    const name = [...type].map(c => c.charCodeAt(0));
    const body = [...name, ...data];

    return [...be32(data.length), ...body, ...be32(crc32(Uint8Array.from(body)))];
}

/** Base64 without a DOM, so this works during a build as well as in a browser. */
function toBase64(bytes: Uint8Array): string {
    const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let out = "";

    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i];
        const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const c = i + 2 < bytes.length ? bytes[i + 2] : 0;

        out += ALPHABET[a >> 2];
        out += ALPHABET[((a & 3) << 4) | (b >> 4)];
        out += (i + 1 < bytes.length) ? ALPHABET[((b & 15) << 2) | (c >> 6)] : "=";
        out += (i + 2 < bytes.length) ? ALPHABET[c & 63] : "=";
    }

    return out;
}

/**
 * RGBA pixels as a PNG data URI.
 *
 * The image is tiny by construction — this exists to draw a twenty pixel
 * placeholder — so the whole thing fits in one stored deflate block and there is
 * no need to handle the case where it does not.
 */
export function rgbaToPngDataUrl(rgba: Uint8ClampedArray, width: number, height: number): string | null {
    if (width <= 0 || height <= 0 || rgba.length !== width * height * 4)
        return null;

    // Every scanline is preceded by its filter type, and none of them are
    // filtered, so every one of those bytes is zero
    const raw = new Uint8Array(height * (1 + width * 4));

    for (let y = 0; y < height; y++) {
        const from = y * width * 4;
        const to = y * (1 + width * 4) + 1;

        raw[to - 1] = 0;
        raw.set(rgba.subarray(from, from + width * 4), to);
    }

    if (raw.length > 0xFFFF)
        return null;

    // 0x78 0x01: deflate, 32K window, and the check bits that make the pair
    // divisible by 31. Then one final stored block, then the checksum.
    const zlib = [
        0x78, 0x01,
        0x01, raw.length & 255, (raw.length >>> 8) & 255,
        (~raw.length) & 255, ((~raw.length) >>> 8) & 255,
        ...raw,
        ...be32(adler32(raw)),
    ];

    const bytes = Uint8Array.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        // 8 bits per channel, colour type 6 (RGBA), no interlacing
        ...chunk("IHDR", [...be32(width), ...be32(height), 8, 6, 0, 0, 0]),
        ...chunk("IDAT", zlib),
        ...chunk("IEND", []),
    ]);

    return `data:image/png;base64,${toBase64(bytes)}`;
}
