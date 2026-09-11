import { describe, expect, it, vi } from "vitest";

import { FEEL_WEIGHT, MIN_TAP_SPACING_MS, patternTimeline } from "./native-haptics";

/*
 * The engine itself is stubbed — vitest hoists these above the import above,
 * so the module under test sees them. What is worth testing here is the shape of the
 * patterns, which is the part that carries meaning. Whether a tap reaches the
 * Taptic Engine can only be judged on a device.
 */
vi.mock("@capacitor/core", () => ({
    Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false },
}));

vi.mock("@capacitor/haptics", () => ({
    Haptics: { impact: async () => {} },
    ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM", Heavy: "HEAVY" },
}));

const contour = (pattern: "reward" | "refuse") =>
    patternTimeline(pattern).map(tap => FEEL_WEIGHT[tap.feel]);

describe("the two answers a song can be given", () => {
    it("rises for a like and falls for a pass", () => {
        expect(contour("reward")).toEqual([1, 3]);
        expect(contour("refuse")).toEqual([3, 1]);
    });

    it("makes them mirror images, which is the part a pocket can tell apart", () => {
        expect(contour("reward")).toEqual([...contour("refuse")].reverse());
    });

    it("is two taps rather than a buzz", () => {
        expect(patternTimeline("reward")).toHaveLength(2);
        expect(patternTimeline("refuse")).toHaveLength(2);
    });

    it("spaces them by at least what the engine needs to separate them", () => {
        for (const pattern of ["reward", "refuse"] as const) {
            const times = patternTimeline(pattern).map(tap => tap.at);

            expect(times[0]).toBe(0);
            expect(times[1] - times[0]).toBeGreaterThanOrEqual(MIN_TAP_SPACING_MS);
        }
    });

    it("can be spaced wider when something slower is being accompanied", () => {
        expect(patternTimeline("reward", 120).map(tap => tap.at)).toEqual([0, 120]);
    });
});
