import { describe, expect, it } from "vitest";

import { timeAgo } from "./time-ago";

const NOW = 1_800_000_000_000;

describe("timeAgo", () => {
    it("reads coarsely, the way a card is read", () => {
        expect(timeAgo(NOW - 30e3, NOW)).toBe("just now");
        expect(timeAgo(NOW - 5 * 60e3, NOW)).toBe("5m ago");
        expect(timeAgo(NOW - 3 * 3600e3, NOW)).toBe("3h ago");
        expect(timeAgo(NOW - 26 * 3600e3, NOW)).toBe("yesterday");
        expect(timeAgo(NOW - 3 * 24 * 3600e3, NOW)).toBe("3d ago");
    });

    /*
     * A friend's device and this one do not agree on the clock, so a play can
     * arrive dated slightly ahead. "in 4 seconds" is a worse answer than
     * treating it as having just happened.
     */
    it("does not count forwards when a friend's clock runs ahead", () => {
        expect(timeAgo(NOW + 4e3, NOW)).toBe("just now");
        expect(timeAgo(NOW + 10 * 60e3, NOW)).toBe("just now");
    });

    it("crosses each boundary the way a reader expects", () => {
        expect(timeAgo(NOW - 59e3, NOW)).toBe("just now");
        expect(timeAgo(NOW - 60e3, NOW)).toBe("1m ago");
        expect(timeAgo(NOW - 59 * 60e3, NOW)).toBe("59m ago");
        expect(timeAgo(NOW - 60 * 60e3, NOW)).toBe("1h ago");
        expect(timeAgo(NOW - 23 * 3600e3, NOW)).toBe("23h ago");
        expect(timeAgo(NOW - 24 * 3600e3, NOW)).toBe("yesterday");
    });
});
