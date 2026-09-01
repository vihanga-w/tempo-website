import { describe, it, expect } from "vitest";
import { decode, encode } from "blurhash";

import { rgbaToPngDataUrl } from "./tiny-png";
import { blurHashToBackground, placeholderBackground } from "./colour-blob";

/** A real hash, encoded here so the test does not depend on a fixture string. */
function hashOf(paint: (x: number, y: number) => [number, number, number]): string {
    const size = 32;
    const px = new Uint8ClampedArray(size * size * 4);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const [r, g, b] = paint(x / size, y / size);
            const o = (y * size + x) * 4;

            px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
        }
    }

    return encode(px, size, size, 4, 4);
}

const PORTRAIT = hashOf((x, y) => (x < 0.45 ? [40, 30, 35] : [230, 220, 205 - y * 40]));

describe("rgbaToPngDataUrl", () => {
    it("writes something a browser would accept as a PNG", () => {
        const uri = rgbaToPngDataUrl(new Uint8ClampedArray(4 * 4 * 4).fill(128), 4, 4);

        expect(uri).toMatch(/^data:image\/png;base64,/);

        const bytes = Uint8Array.from(atob(uri!.split(",")[1]), c => c.charCodeAt(0));

        // The PNG signature, then IHDR as the first chunk
        expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        expect(String.fromCharCode(...bytes.slice(12, 16))).toBe("IHDR");
        expect(String.fromCharCode(...bytes.slice(-8, -4))).toBe("IEND");
    });

    it("records the size it was given", () => {
        const uri = rgbaToPngDataUrl(new Uint8ClampedArray(6 * 3 * 4), 6, 3);
        const bytes = Uint8Array.from(atob(uri!.split(",")[1]), c => c.charCodeAt(0));
        const be32 = (at: number) =>
            (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];

        expect(be32(16)).toBe(6);
        expect(be32(20)).toBe(3);
    });

    it("refuses a buffer that is not the size it claims", () => {
        expect(rgbaToPngDataUrl(new Uint8ClampedArray(10), 4, 4)).toBeNull();
        expect(rgbaToPngDataUrl(new Uint8ClampedArray(0), 0, 0)).toBeNull();
    });

    it("is deterministic, so it is the same in a build and in a browser", () => {
        const px = new Uint8ClampedArray(8 * 8 * 4).fill(70);

        expect(rgbaToPngDataUrl(px, 8, 8)).toBe(rgbaToPngDataUrl(px, 8, 8));
    });
});

describe("blurHashToBackground", () => {
    it("turns a hash into a drawable background", () => {
        const background = blurHashToBackground(PORTRAIT);

        expect(background).toMatch(/^url\("data:image\/png;base64,/);
    });

    it("keeps the shape of the picture, not just its average", () => {
        // The whole point: the dark side has to stay on the dark side. A 4x4
        // grid of averages loses this, which is why it was replaced.
        const px = decode(PORTRAIT, 8, 8);
        const at = (x: number, y: number) => px[(y * 8 + x) * 4];

        expect(at(1, 4)).toBeLessThan(at(6, 4));
    });

    it("has nothing to say about something that is not a hash", () => {
        expect(blurHashToBackground("")).toBeUndefined();
        expect(blurHashToBackground("not a hash")).toBeUndefined();
        expect(blurHashToBackground(undefined)).toBeUndefined();
        expect(blurHashToBackground(null)).toBeUndefined();
    });
});

describe("placeholderBackground", () => {
    const BLOB = "xJZ4zqKDvIxulm5Y0qiK5L6gyJt8nnRcqn5kxph6tIZqhGBMeFhGjGhSflxIYEY4";

    it("prefers the hash, which keeps more of the picture", () => {
        expect(placeholderBackground(PORTRAIT, BLOB)).toMatch(/^url\(/);
    });

    it("falls back to the grid for an account an older server resolved", () => {
        expect(placeholderBackground(undefined, BLOB)).toMatch(/radial-gradient/);
    });

    it("returns nothing when there is neither", () => {
        expect(placeholderBackground(undefined, undefined)).toBeUndefined();
    });
});
