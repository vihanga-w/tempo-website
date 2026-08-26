import { describe, it, expect } from "vitest";

import { describeTracks, describeWhen } from "./friend-recent-activity-row";
import type { FriendRecentActivity } from "@/lib/usrlib";

/**
 * Both of these are read at a glance and never dwelt on, which is exactly why
 * they have to be right: a row that says "+0 more" or "0m ago" is the kind of
 * wrong that survives a demo and then sits in front of everybody.
 */
describe("describeWhen", () => {
    const NOW = 1_700_000_000_000;
    const MINUTE = 60e3;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;

    const at = (agoMs: number) => describeWhen(NOW - agoMs, NOW);

    it("calls the last few minutes just now", () => {
        expect(at(0)).toBe("just now");
        expect(at(4 * MINUTE)).toBe("just now");
    });

    it("counts minutes within the hour", () => {
        expect(at(20 * MINUTE)).toBe("20m ago");
    });

    it("never says 0m, which is what rounding to the minute would produce", () => {
        // The "just now" band exists to stop this; the boundary is what proves it
        expect(at(5 * MINUTE)).toBe("5m ago");
    });

    it("counts whole hours within the day", () => {
        expect(at(2 * HOUR)).toBe("2h ago");
        // Rounds down: 2h59 is still "2h ago", never "3h ago" before it is
        expect(at(2 * HOUR + 59 * MINUTE)).toBe("2h ago");
    });

    it("says yesterday rather than 1d ago", () => {
        expect(at(30 * HOUR)).toBe("yesterday");
    });

    it("counts days beyond that", () => {
        expect(at(3 * DAY)).toBe("3d ago");
    });

    it("does not report a future timestamp as a negative age", () => {
        // A clock running fast should read as "just now", not "-2m ago"
        expect(describeWhen(NOW + 2 * MINUTE, NOW)).toBe("just now");
    });
});

describe("describeTracks", () => {
    const activity = (names: string[], playCount?: number): FriendRecentActivity => ({
        userId: "u",
        username: "Vidhu",
        lastPlayedAt: 0,
        onRepeat: false,
        playCount: playCount ?? names.length,
        tracks: names.map((name, i) => ({
            songId: `s${i.toString()}`,
            timestamp: i,
            replayed: false,
            track: { name } as FriendRecentActivity["tracks"][number]["track"],
        })),
    });

    it("names a single track on its own", () => {
        expect(describeTracks(activity(["Nights"]))).toBe("Nights");
    });

    it("names the newest and counts the rest", () => {
        expect(describeTracks(activity(["Nights", "Solo", "Pink + White"]))).toBe("Nights +2 more");
    });

    it("counts plays the server capped away, not just the ones sent", () => {
        // Four covers arrived but they played nine tracks
        expect(describeTracks(activity(["Nights", "Solo", "Pyramids", "Ivy"], 9))).toBe("Nights +8 more");
    });

    it("never says +0 more", () => {
        expect(describeTracks(activity(["Nights"], 1))).toBe("Nights");
    });

    it("survives a friend whose tracks did not arrive", () => {
        expect(describeTracks(activity([]))).toBe("");
    });
});
