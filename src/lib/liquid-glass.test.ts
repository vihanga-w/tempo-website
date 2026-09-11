import { describe, expect, it } from "vitest";
import { glassSurface, parseColour } from "./liquid-glass";

/**
 * The glass taking on the page's colour.
 *
 * Whether it looks right is judged by eye. What these pin is what would go
 * wrong quietly: a colour in a format that is not understood tinting the glass
 * with garbage instead of leaving it clear, and a change of page snapping the
 * tint instead of passing — which is what happens the moment the tinted and
 * untinted glass stop having the same number of shadows to animate between.
 */

describe("reading the page's colour", () => {
    it("reads hex, short and long", () => {
        expect(parseColour("#e9e7fb")).toEqual([233, 231, 251]);
        expect(parseColour("#FFF")).toEqual([255, 255, 255]);
    });

    it("reads rgb() and rgba()", () => {
        expect(parseColour("rgb(244, 179, 154)")).toEqual([244, 179, 154]);
        expect(parseColour("rgba(1,2,3,0.5)")).toEqual([1, 2, 3]);
    });

    it("leaves the glass clear for anything it cannot read", () => {
        expect(parseColour(undefined)).toBeNull();
        expect(parseColour("")).toBeNull();
        expect(parseColour("oklch(0.8 0.1 40)")).toBeNull();
        expect(parseColour("not a colour")).toBeNull();
    });
});

describe("tinted glass", () => {
    const shadows = (boxShadow: unknown) => String(boxShadow).match(/rgba\(/g)?.length ?? 0;

    it("washes the body and the edges with the page's colour", () => {
        const glass = glassSurface({ tint: "#f4b39a" });

        expect(glass.backgroundColor).toBe("rgba(244,179,154,0.14)");
        expect(String(glass.boxShadow)).toContain("rgba(244,179,154,");
    });

    it("stays clear without one", () => {
        const glass = glassSurface();

        expect(glass.backgroundColor).toBe("rgba(255,255,255,0)");
        expect(String(glass.boxShadow)).not.toMatch(/rgba\(244/);
    });

    it("has the same shadows to animate between, tinted or not, so a change of page passes rather than snaps", () => {
        expect(shadows(glassSurface({ tint: "#f4b39a" }).boxShadow))
            .toBe(shadows(glassSurface().boxShadow));
    });

    it("keeps the sheen in the image and the colour in the colour, where it can be animated", () => {
        const glass = glassSurface({ tint: "#f4b39a" });
        const image = String((glass.style as { backgroundImage?: string } | undefined)?.backgroundImage);

        expect(image).toMatch(/^linear-gradient/);
        expect(image).not.toContain("244");
    });

    it("keeps the gradient out of Chakra's hands, where its parser misreads the angle", () => {
        // Chakra's backgroundImage prop reads "150deg" as a colour token.
        expect(glassSurface({ tint: "#f4b39a" }).backgroundImage).toBeUndefined();
    });
});
