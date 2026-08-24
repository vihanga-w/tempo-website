import { describe, expect, it } from "vitest";

import {
    apcaLc,
    hexToRgb,
    PAGE_BG,
    panelFill,
    parseRgb,
    readableAccent,
    rgbToHex,
    type Rgb,
} from "./artwork-colour";

/** Rec. 709 relative luminance on the raw channels, as panelFill caps on. */
function luminance(hex: string) {
    const rgb = hexToRgb(hex)!;

    return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

function hue({ r, g, b }: Rgb) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    if (max === min)
        return -1;

    if (max === r)
        return ((g - b) / (max - min) + 6) % 6;

    if (max === g)
        return (b - r) / (max - min) + 2;

    return (r - g) / (max - min) + 4;
}

describe("parseRgb", () => {
    it("reads what FastAverageColor hands over", () => {
        expect(parseRgb("rgb(12, 34, 56)")).toEqual({ r: 12, g: 34, b: 56 });
        expect(parseRgb("rgb(0,0,0)")).toEqual({ r: 0, g: 0, b: 0 });
    });

    it("answers null rather than a partial colour", () => {
        expect(parseRgb("rgb(12, 34)")).toBeNull();
        expect(parseRgb("not a colour")).toBeNull();
        expect(parseRgb("")).toBeNull();
    });
});

describe("rgbToHex and hexToRgb", () => {
    it("round-trip", () => {
        for (const rgb of [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, { r: 13, g: 200, b: 47 }])
            expect(hexToRgb(rgbToHex(rgb))).toEqual(rgb);
    });

    it("pads a single digit channel", () => {
        expect(rgbToHex({ r: 1, g: 2, b: 3 })).toBe("#010203");
    });

    it("clamps rather than wrapping past the ends", () => {
        expect(rgbToHex({ r: 300, g: -20, b: 128 })).toBe("#00ff0080".slice(0, 1) + "ff0080");
    });
});

describe("readableAccent", () => {
    /*
     * The whole reason this function exists. The colour taken off a sleeve is
     * whatever it is, and it has to end up legible against a near black page.
     */
    it("lifts a colour dark enough to be unreadable until it is readable", () => {
        const fromDarkCover = readableAccent({ r: 40, g: 12, b: 8 });

        expect(apcaLc(fromDarkCover, PAGE_BG)).toBeGreaterThan(55);
    });

    it("clears the contrast target for a wide spread of covers", () => {
        const covers: Rgb[] = [
            { r: 220, g: 20, b: 20 },
            { r: 20, g: 20, b: 220 },
            { r: 108, g: 17, b: 24 },
            { r: 139, g: 98, b: 69 },
            { r: 8, g: 40, b: 12 },
            { r: 240, g: 220, b: 60 },
            { r: 90, g: 12, b: 140 },
        ];

        for (const cover of covers)
            expect(apcaLc(readableAccent(cover), PAGE_BG)).toBeGreaterThan(55);
    });

    it("keeps the hue of the cover it came from", () => {
        const red = hexToRgb(readableAccent({ r: 200, g: 30, b: 30 }))!;
        const blue = hexToRgb(readableAccent({ r: 30, g: 30, b: 200 }))!;

        expect(red.r).toBeGreaterThan(red.b);
        expect(blue.b).toBeGreaterThan(blue.r);

        // And near enough the same hue, not merely on the right side of neutral
        expect(Math.abs(hue(red) - hue({ r: 200, g: 30, b: 30 }))).toBeLessThan(1);
    });

    /*
     * A greyscale sleeve has no hue to keep. Tinting off one produces an
     * off-white that reads as a rendering fault rather than as a colour, so it
     * is sent to white deliberately.
     */
    it("sends a colourless cover to white rather than to an almost-white", () => {
        expect(readableAccent({ r: 161, g: 159, b: 160 })).toBe("#ffffff");
        expect(readableAccent({ r: 20, g: 20, b: 20 })).toBe("#ffffff");
        expect(readableAccent({ r: 128, g: 128, b: 128 })).toBe("#ffffff");
    });

    it("always answers with a colour", () => {
        for (const rgb of [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, { r: 1, g: 254, b: 1 }])
            expect(readableAccent(rgb)).toMatch(/^#[0-9a-f]{6}$/);
    });
});

describe("panelFill", () => {
    /*
     * White text sits on this panel, so however pale the sleeve, the fill has to
     * come back dark. Before the cap, a white cover produced a panel the size of
     * the screen with white text on it.
     */
    it("stays dark enough for white text even for a white cover", () => {
        for (const rgb of [
            { r: 255, g: 255, b: 255 },
            { r: 250, g: 240, b: 200 },
            { r: 200, g: 255, b: 200 },
        ]) {
            const panel = panelFill(rgb);

            expect(luminance(panel)).toBeLessThanOrEqual(0.23);
            expect(apcaLc("#ffffff", panel)).toBeGreaterThan(75);
        }
    });

    it("keeps the character of a dark cover rather than flattening it", () => {
        const panel = hexToRgb(panelFill({ r: 108, g: 17, b: 24 }))!;

        expect(panel.r).toBeGreaterThan(panel.g);
        expect(panel.r).toBeGreaterThan(panel.b);
    });

    it("answers a colour for anything", () => {
        for (const rgb of [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, { r: 12, g: 200, b: 90 }])
            expect(panelFill(rgb)).toMatch(/^#[0-9a-f]{6}$/);
    });
});

describe("apcaLc", () => {
    it("reports high contrast for white on the page", () => {
        expect(apcaLc("#ffffff", PAGE_BG)).toBeGreaterThan(100);
    });

    it("reports nothing for a colour on itself", () => {
        expect(apcaLc(PAGE_BG, PAGE_BG)).toBe(0);
    });

    /*
     * The first version of this returned 0 for everything, because it compared a
     * negative reverse-polarity value against a positive threshold. Every
     * measurement it produced was a zero that looked like a real reading.
     */
    it("does not report zero for a pair that plainly has contrast", () => {
        expect(apcaLc("#ffd4b4", PAGE_BG)).toBeGreaterThan(50);
        expect(apcaLc("#A480FF", PAGE_BG)).toBeGreaterThan(30);
    });

    it("grows as the text gets lighter against a dark ground", () => {
        const dim = apcaLc("#555555", PAGE_BG);
        const bright = apcaLc("#eeeeee", PAGE_BG);

        expect(bright).toBeGreaterThan(dim);
    });
});
