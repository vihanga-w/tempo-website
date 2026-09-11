import { describe, expect, it } from "vitest";

import {
    decideSwipe, dragThreshold, ratingStrength,
    DRAG_MAX, DRAG_MIN, FLICK_SPEED,
} from "./swipe";

const PHONE = 390;

describe("dragThreshold", () => {
    it("is a fraction of the axis, held between a twitch and a haul", () => {
        expect(dragThreshold(PHONE)).toBeCloseTo(54.6, 1);
        expect(dragThreshold(200)).toBe(DRAG_MIN);
        expect(dragThreshold(1024)).toBe(DRAG_MAX);
    });

    it("asks for less than the 90px it used to", () => {
        expect(dragThreshold(PHONE)).toBeLessThan(90);
    });
});

describe("decideSwipe", () => {
    it("takes a short flick, without the distance", () => {
        expect(decideSwipe(24, 900, PHONE)).toBe("positive");
        expect(decideSwipe(-24, -900, PHONE)).toBe("negative");
    });

    it("takes a slow drag that went far enough", () => {
        expect(decideSwipe(60, 0, PHONE)).toBe("positive");
        expect(decideSwipe(-60, 0, PHONE)).toBe("negative");
    });

    it("stays put for a small, slow drag", () => {
        expect(decideSwipe(20, 100, PHONE)).toBe("stay");
        expect(decideSwipe(-20, -100, PHONE)).toBe("stay");
    });

    it("ignores a fast tap that went nowhere", () => {
        expect(decideSwipe(3, 1200, PHONE)).toBe("stay");
    });

    it("leaves a card that was dragged out and brought back", () => {
        // Ended 30px out, but the finger was heading home at the release
        expect(decideSwipe(30, -700, PHONE)).toBe("stay");
    });

    it("still takes a drag that went far, whichever way the finger was moving at the end", () => {
        expect(decideSwipe(80, -700, PHONE)).toBe("positive");
    });

    it("is decided by speed exactly at the flick threshold", () => {
        expect(decideSwipe(20, FLICK_SPEED, PHONE)).toBe("positive");
        expect(decideSwipe(20, FLICK_SPEED - 1, PHONE)).toBe("stay");
    });
});

describe("ratingStrength", () => {
    it("runs from a gentle 1 to a hard 5", () => {
        expect(ratingStrength(500)).toBe(1);
        expect(ratingStrength(1000)).toBe(1);
        expect(ratingStrength(2000)).toBeCloseTo(2.5, 1);
        expect(ratingStrength(9000)).toBe(5);
    });

    it("says the least it can about a speed it cannot read", () => {
        expect(ratingStrength(0)).toBe(1);
        expect(ratingStrength(Number.NaN)).toBe(1);
    });
});
