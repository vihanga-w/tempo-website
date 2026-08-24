import { describe, expect, it } from "vitest";

import { colourBlobToBackground } from "./colour-blob";

/** 16 pixels of one colour, encoded the way the server encodes them. */
function blobOf(colours: [number, number, number][]): string {
    const bytes: number[] = [];

    for (let pixel = 0; pixel < 16; pixel++) {
        const [r, g, b] = colours[pixel % colours.length];

        bytes.push(r, g, b);
    }

    return Buffer.from(bytes).toString("base64");
}

const RED = blobOf([[220, 20, 20]]);

describe("colourBlobToBackground", () => {
    it("builds a background out of the colours it was given", () => {
        const background = colourBlobToBackground(RED);

        expect(background).toBeTypeOf("string");
        expect(background).toContain("rgb(220,20,20)");
        expect(background).toContain("radial-gradient");
    });

    it("puts each corner where that corner's colour was", () => {
        // Distinct corners: top-left, top-right, bottom-left, bottom-right of a
        // 4x4 grid are pixels 0, 3, 12 and 15
        const bytes: number[] = new Array(48).fill(0);

        const put = (pixel: number, rgb: [number, number, number]) => {
            bytes[pixel * 3] = rgb[0];
            bytes[pixel * 3 + 1] = rgb[1];
            bytes[pixel * 3 + 2] = rgb[2];
        };

        put(0, [255, 0, 0]);
        put(3, [0, 255, 0]);
        put(12, [0, 0, 255]);
        put(15, [255, 255, 0]);

        const background = colourBlobToBackground(Buffer.from(bytes).toString("base64"))!;

        expect(background).toMatch(/22% 22%, rgb\(255,0,0\)/);
        expect(background).toMatch(/78% 22%, rgb\(0,255,0\)/);
        expect(background).toMatch(/22% 78%, rgb\(0,0,255\)/);
        expect(background).toMatch(/78% 78%, rgb\(255,255,0\)/);
    });

    it("lays the average of the whole picture underneath", () => {
        // Half black, half white averages to mid grey
        const bytes: number[] = [];

        for (let pixel = 0; pixel < 16; pixel++) {
            const value = (pixel < 8 ? 0 : 255);

            bytes.push(value, value, value);
        }

        const background = colourBlobToBackground(Buffer.from(bytes).toString("base64"))!;

        // 128 either way depending on rounding
        expect(background).toMatch(/linear-gradient\(rgb\(1(27|28),1(27|28),1(27|28)\)/);
    });

    /*
     * The regression. This was built on a canvas to begin with, which needs a
     * document — so during server rendering it produced nothing, the markup
     * shipped with an empty placeholder, and React kept that markup through
     * hydration. The blob appeared on client-side navigations and never on a
     * cold load, which is the load that matters.
     */
    it("works with no document at all, as it must during server rendering", () => {
        const realDocument = globalThis.document;

        // @ts-expect-error — deliberately taking the DOM away
        delete globalThis.document;

        try {
            // A colour not used elsewhere in this file, so the cache cannot be
            // what makes this pass
            const background = colourBlobToBackground(blobOf([[7, 99, 201]]));

            expect(background).toBeTypeOf("string");
            expect(background).toContain("rgb(7,99,201)");
        } finally {
            globalThis.document = realDocument;
        }
    });

    it("gives the same answer twice", () => {
        expect(colourBlobToBackground(RED)).toBe(colourBlobToBackground(RED));
    });

    it("refuses anything that is not a blob", () => {
        const bad = [
            undefined,
            null,
            "",
            "A".repeat(63),
            "A".repeat(65),
            // Padding, which 48 bytes never produces
            "A".repeat(62) + "==",
            // Base64url rather than base64
            "A".repeat(62) + "-_",
            "!".repeat(64),
            " ".repeat(64),
        ];

        for (const value of bad)
            expect(colourBlobToBackground(value as string | undefined | null)).toBeUndefined();
    });

    it("produces something a browser would accept", () => {
        const background = colourBlobToBackground(RED)!;

        // Balanced brackets and no stray separators, which is the shape of a
        // background-image that silently does nothing when it is wrong
        expect(background.split("(").length).toBe(background.split(")").length);
        expect(background).not.toContain(",,");
        expect(background.trim()).not.toMatch(/,$/);
    });
});
