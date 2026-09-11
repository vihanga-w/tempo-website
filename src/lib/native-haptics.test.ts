import { describe, expect, it, vi } from "vitest";

import {
    FEEL_WEIGHT, LATE_DROP_MS, MIN_TAP_SPACING_MS, nextSlot, patternTimeline,
} from "./native-haptics";

/*
 * The engine itself is stubbed — vitest hoists these above the import above, so
 * the module under test sees them. What is worth testing is the shape of the
 * patterns and the rule that spaces them, which is where the meaning is.
 * Whether a tap reaches the Taptic Engine can only be judged on a device.
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

const gaps = (pattern: "reward" | "refuse" | "undone") => {
    const times = patternTimeline(pattern).map(tap => tap.at);

    return times.slice(1).map((at, i) => at - times[i]);
};

describe("the two answers a song can be given", () => {
    it("rises for a like and falls for a pass", () => {
        expect(contour("reward")).toEqual([1, 3]);
        expect(contour("refuse")).toEqual([3, 1]);
    });

    it("makes them mirror images, which is half of what tells them apart", () => {
        expect(contour("reward")).toEqual([...contour("refuse")].reverse());
    });

    it("gives them different tempos, which is the other half", () => {
        // A like is quick, a pass is deliberate; either alone would be legible,
        // and both together survive a pocket
        expect(gaps("reward")).toEqual([130]);
        expect(gaps("refuse")).toEqual([190]);
    });

    it("leaves the taps far enough apart to read as separate events", () => {
        // Comfortably clear of the floor, not at it: at the floor a heavy tap's
        // own ring is still decaying under the next one and the pair felt as one
        for (const pattern of ["reward", "refuse"] as const)
            for (const gap of gaps(pattern))
                expect(gap).toBeGreaterThan(MIN_TAP_SPACING_MS * 1.5);
    });

    it("says taking one back with a single tap", () => {
        expect(patternTimeline("undone")).toEqual([{ feel: "close", at: 0 }]);
    });

    it("starts every pattern immediately", () => {
        for (const pattern of ["reward", "refuse", "undone"] as const)
            expect(patternTimeline(pattern)[0].at).toBe(0);
    });

    it("hands out copies, so a caller cannot bend the shapes", () => {
        const timeline = patternTimeline("reward");

        timeline[0].at = 999;

        expect(patternTimeline("reward")[0].at).toBe(0);
    });
});

describe("nextSlot", () => {
    it("lets a tap go at once when the engine is idle", () => {
        expect(nextSlot(1000, 0)).toBe(1000);
    });

    it("holds a tap back to the engine's spacing", () => {
        expect(nextSlot(1000, 990)).toBe(990 + MIN_TAP_SPACING_MS);
    });

    it("drops a tap that could only arrive adrift from the gesture", () => {
        expect(nextSlot(1000, 1000 + LATE_DROP_MS)).toBeNull();
    });

    it("keeps one that is late but still attached", () => {
        expect(nextSlot(1000, 1000 - MIN_TAP_SPACING_MS + LATE_DROP_MS)).not.toBeNull();
    });
});
