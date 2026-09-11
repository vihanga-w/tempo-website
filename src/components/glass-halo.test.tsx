import { describe, expect, it } from "vitest";
import { HALO_BLOOM_OPACITY, HALO_LINE_OPACITY, HALO_MASK, haloStops } from "./glass-halo";

/**
 * The halo along the top of a floating control.
 *
 * What it looks like is judged by eye. What these pin is what would show as a
 * fault: a seam where the colour loop does not close as it turns, and a mask
 * that lets the colour down the sides rather than keeping it across the top.
 */
describe("the halo's colours", () => {
    it("closes the loop on the first colour, so no seam shows as it turns", () => {
        const stops = haloStops(["#f00", "#0f0", "#00f"]).split(", ");

        expect(stops[0]).toBe("#f00 0deg");
        expect(stops.at(-1)).toBe("#f00 360deg");
    });

    it("spaces the colours evenly around the turn", () => {
        expect(haloStops(["#f00", "#0f0", "#00f", "#ff0"])).toBe(
            "#f00 0deg, #0f0 90deg, #00f 180deg, #ff0 270deg, #f00 360deg",
        );
    });
});

describe("the halo's mask", () => {
    it("is a ring faded out from the top: a fade, the content box, and the whole box, in that order", () => {
        const layers = HALO_MASK.split(/,\s*(?=linear-gradient)/);

        expect(layers).toHaveLength(3);
        expect(layers[0]).toMatch(/^linear-gradient\(to bottom, #000 0%/);
        expect(layers[0]).toMatch(/transparent \d+%\)$/);
        expect(layers[1]).toMatch(/content-box$/);
    });
});

describe("the halo's strength", () => {
    it("stays faint: a reflection in the glass, not a light of its own", () => {
        // The first version ran at 0.85 and 0.55 and read as an effect laid on
        // the button. These are ceilings, not targets.
        expect(HALO_LINE_OPACITY).toBeLessThanOrEqual(0.4);
        expect(HALO_BLOOM_OPACITY).toBeLessThanOrEqual(0.25);
    });

    it("is gone by halfway down the sides", () => {
        const fade = HALO_MASK.split(/,\s*(?=linear-gradient)/)[0];
        const end = Number(/transparent (\d+)%\)$/.exec(fade)?.[1]);

        expect(end).toBeLessThanOrEqual(60);
    });
});
