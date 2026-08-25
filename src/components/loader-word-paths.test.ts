import { describe, expect, it } from "vitest";

import { LOADER_WORDS } from "./loader-word-paths";

/**
 * These outlines are generated, and two of the twelve once shipped with a NaN
 * in a single curve. A renderer abandons a path at the first token it cannot
 * read, so those words drew one letter and stopped - which on a loading screen
 * that changes five times a second looked exactly like a font failing to load,
 * and said nothing about itself anywhere.
 */
describe("loader word outlines", () => {
    it("covers every hand in the loop", () => {
        expect(LOADER_WORDS.length).toBe(12);
    });

    it("contains nothing a renderer would refuse", () => {
        for (const word of LOADER_WORDS)
            expect(word.path, word.family).not.toMatch(/NaN|undefined|Infinity/);
    });

    it("draws a whole word rather than part of one", () => {
        for (const word of LOADER_WORDS) {
            // "Tempo" is five letters and none of them draw in a single stroke,
            // so anything short of five separate contours has lost some
            const contours = word.path.split("M").length - 1;

            expect(contours, word.family).toBeGreaterThanOrEqual(5);
        }
    });

    it("is measured around the letters, not the em square", () => {
        for (const word of LOADER_WORDS) {
            expect(word.viewBox, word.family).toMatch(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/);
            expect(word.width, word.family).toBeGreaterThan(0);
            expect(word.height, word.family).toBeGreaterThan(0);
        }
    });
});
