import { describe, expect, it } from "vitest";

import { backdropOf, LIGHT_BACKDROP, regionLuminances, relativeLuminance } from "./cover-tone";

describe("relativeLuminance", () => {
    it("runs from black to white on WCAG's scale", () => {
        expect(relativeLuminance(0, 0, 0)).toBe(0);
        expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
        // #767676, the lightest grey white text still clears 4.5:1 against
        expect(relativeLuminance(0x76, 0x76, 0x76)).toBeCloseTo(0.181, 2);
    });
});

describe("the line between a light and a dark backdrop", () => {
    it("is where a white glyph stops clearing 3:1", () => {
        const contrast = (1 + 0.05) / (LIGHT_BACKDROP + 0.05);

        expect(contrast).toBeCloseTo(3, 5);
    });
});

describe("backdropOf", () => {
    it("reads a white sleeve as light and a black one as dark", () => {
        expect(backdropOf(new Array(100).fill(1))).toBe("light");
        expect(backdropOf(new Array(100).fill(0.02))).toBe("dark");
    });

    it("counts a bright patch on a dark sleeve, which a mean would average away", () => {
        // 30% white on black: the mean is 0.3, right on the line, and says dark
        const patchy = [...new Array(70).fill(0), ...new Array(30).fill(1)];

        expect(backdropOf(patchy)).toBe("light");
    });

    it("ignores a few highlights", () => {
        const specks = [...new Array(90).fill(0.01), ...new Array(10).fill(1)];

        expect(backdropOf(specks)).toBe("dark");
    });

    it("assumes dark when there is nothing to read, which is how the controls were drawn before", () => {
        expect(backdropOf([])).toBe("dark");
    });
});

describe("regionLuminances", () => {
    /** A 4x4 image: white along the bottom row, black elsewhere, one transparent pixel. */
    function image() {
        const size = 4;
        const pixels = new Uint8ClampedArray(size * size * 4);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const i = (y * size + x) * 4;
                const v = (y === size - 1 ? 255 : 0);

                pixels.set([v, v, v, 255], i);
            }
        }

        // The bottom-left pixel is see-through, and so not part of the backdrop
        pixels[(3 * size + 0) * 4 + 3] = 0;

        return { pixels, size };
    }

    it("reads only the region asked for, and only what is opaque", () => {
        const { pixels, size } = image();

        const foot = regionLuminances(pixels, size, { x0: 0, x1: 1, y0: 0.75, y1: 1 });
        const corner = regionLuminances(pixels, size, { x0: 0, x1: 0.5, y0: 0.5, y1: 1 });

        expect(foot).toHaveLength(3);
        expect(foot.every(l => l > 0.99)).toBe(true);
        expect(corner).toHaveLength(3);
        expect(corner.filter(l => l > 0.99)).toHaveLength(1);
    });
});
