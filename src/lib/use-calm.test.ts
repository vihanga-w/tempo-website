import { describe, expect, it } from "vitest";

import { CALM_FPS, isStruggling } from "./use-calm";

const frames = (ms: number, count = 20) => new Array(count).fill(ms);

describe("isStruggling", () => {
    it("is calm about 60fps and 120fps", () => {
        expect(isStruggling(frames(16.7))).toBe(false);
        expect(isStruggling(frames(8.3))).toBe(false);
    });

    it("catches the 30fps that Low Power Mode caps iOS at", () => {
        expect(isStruggling(frames(33.3))).toBe(true);
    });

    it("ignores one long frame among good ones", () => {
        const mostlyFine = [...frames(16.7, 19), 300];

        expect(isStruggling(mostlyFine)).toBe(false);
    });

    it("says nothing when it has not measured anything", () => {
        expect(isStruggling([])).toBe(false);
    });

    it("draws the line where the frame budget is", () => {
        const budget = 1000 / CALM_FPS;

        expect(isStruggling(frames(budget - 1))).toBe(false);
        expect(isStruggling(frames(budget + 1))).toBe(true);
    });
});
