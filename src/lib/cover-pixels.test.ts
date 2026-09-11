import { beforeEach, describe, expect, it, vi } from "vitest";

import { COVERS_KEPT, coversHeld, forgetCovers, readCoverPixels, type PixelLoader } from "./cover-pixels";

function counting(): { load: PixelLoader; calls: () => string[] } {
    const calls: string[] = [];

    return {
        load: async (src, size) => {
            calls.push(src);

            return { data: new Uint8ClampedArray(size * size * 4), size };
        },
        calls: () => calls,
    };
}

beforeEach(() => forgetCovers());

describe("readCoverPixels", () => {
    it("reads a cover once, however many times it is asked for", async () => {
        const { load, calls } = counting();

        await readCoverPixels("a.jpg", { load });
        await readCoverPixels("a.jpg", { load });
        await readCoverPixels("a.jpg", { load });

        expect(calls()).toEqual(["a.jpg"]);
    });

    it("gives two readers asking at once the same read", async () => {
        const { load, calls } = counting();

        // The accent and the palette ask in the same breath
        const [first, second] = await Promise.all([
            readCoverPixels("b.jpg", { load }),
            readCoverPixels("b.jpg", { load }),
        ]);

        expect(calls()).toEqual(["b.jpg"]);
        expect(first).toBe(second);
    });

    it("holds a dozen covers and no more", async () => {
        const { load } = counting();

        for (let i = 0; i < COVERS_KEPT + 6; i++)
            await readCoverPixels(`cover-${i}.jpg`, { load });

        expect(coversHeld()).toBe(COVERS_KEPT);
    });

    it("drops the cover nobody has looked at for longest", async () => {
        const { load, calls } = counting();

        await readCoverPixels("keep.jpg", { load });

        // Asked for again along the way, so it is not the oldest by the end
        for (let i = 0; i < COVERS_KEPT; i++) {
            await readCoverPixels(`filler-${i}.jpg`, { load });
            await readCoverPixels("keep.jpg", { load });
        }

        expect(calls().filter(src => src === "keep.jpg")).toEqual(["keep.jpg"]);
    });

    it("remembers that a cover could not be read, rather than asking on every card", async () => {
        const failing: PixelLoader = async () => null;

        expect(await readCoverPixels("gone.jpg", { load: failing })).toBeNull();

        const { load, calls } = counting();

        // Cached as a null, so the next reader is not made to wait on it again
        await readCoverPixels("gone.jpg", { load });
        expect(calls()).toEqual([]);
    });

    it("keeps sizes apart", async () => {
        const { load, calls } = counting();

        await readCoverPixels("c.jpg", { load });
        await readCoverPixels("c.jpg", { load, size: 32 });

        expect(calls()).toEqual(["c.jpg", "c.jpg"]);
    });
});
