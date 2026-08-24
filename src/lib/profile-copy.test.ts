import { describe, expect, it } from "vitest";

import { shortName, weekLine } from "./profile-copy";

const HOUR = 3600e3;

describe("shortName", () => {
    it("takes the first word of a full name", () => {
        expect(shortName("Vihanga Weerasinghe")).toBe("Vihanga");
        expect(shortName("Mary Jane Watson")).toBe("Mary");
    });

    it("leaves a name that is already one word alone", () => {
        expect(shortName("Vihanga")).toBe("Vihanga");
    });

    it("keeps a hyphenated first name whole", () => {
        expect(shortName("Jean-Luc Picard")).toBe("Jean-Luc");
        expect(shortName("O'Brien Smith")).toBe("O'Brien");
    });

    it("copes with however the spacing was typed", () => {
        expect(shortName("  Vihanga   Weerasinghe  ")).toBe("Vihanga");
        // A non-breaking space is still a space to a reader
        expect(shortName("Ada Lovelace")).toBe("Ada");
        expect(shortName("Ada\tLovelace")).toBe("Ada");
    });

    /*
     * The regression. Music accounts are very often called things like
     * "🎧 dj nights", and the plain first word of that is a headphone — which
     * is what would have gone at the top of their profile.
     */
    it("skips a leading decoration and finds the actual name", () => {
        expect(shortName("🎧 dj nights")).toBe("dj");
        expect(shortName("★ Luna ★")).toBe("Luna");
        expect(shortName("♫ ♪ Sam")).toBe("Sam");
    });

    it("falls back to the whole thing when no word has a letter or a number in it", () => {
        expect(shortName("🎧 ♫")).toBe("🎧 ♫");
    });

    it("keeps a name that is not written in latin script", () => {
        expect(shortName("さくら 田中")).toBe("さくら");
        expect(shortName("Дмитрий Иванов")).toBe("Дмитрий");
    });

    it("has something to return for nothing at all", () => {
        expect(shortName(undefined)).toBe("");
        expect(shortName("")).toBe("");
        expect(shortName("   ")).toBe("");
    });
});

describe("weekLine", () => {
    const stats = (hours: number, songs: number, streakHours: number) => ({
        totalListeningDuration: hours * HOUR,
        uniqueSongsPlayedCount: songs,
        longestStreak: streakHours * HOUR,
    });

    it("tells somebody with nothing yet what would change that", () => {
        expect(weekLine(stats(0, 0, 0), true)).toBe("Press play and this starts filling in.");
    });

    it("does not tell somebody else to press play on a profile that is not theirs", () => {
        expect(weekLine(stats(0, 0, 0), false)).toBe("Nothing played in the past week.");
    });

    it("says the daily average, which is the one figure the tiles cannot show", () => {
        // 7h across seven days is an hour a day
        expect(weekLine(stats(7, 30, 1), true)).toContain("1h 0m");
    });

    it("rounds the average from the total rather than from anything else", () => {
        // 4h 12m over seven days is 36m
        const line = weekLine(
            { totalListeningDuration: (4 * 60 + 12) * 60e3, uniqueSongsPlayedCount: 38, longestStreak: HOUR },
            true,
        );

        expect(line).toContain("36m");
    });

    /*
     * The regression this function exists for. Every branch of it used to read
     * back a figure sitting in a tile immediately above it — "mostly in one
     * sitting: 1h 7m" restated the longest streak word for word, and the others
     * restated the song count. A caption that repeats what it sits under costs a
     * line and a read to say nothing.
     */
    it("never reads back the streak tile", () => {
        for (const hours of [0.5, 4, 12, 25]) {
            for (const streak of [0, 1, 3]) {
                const line = weekLine(stats(hours, 40, streak), true);

                expect(line).not.toMatch(/sitting|streak|without stopping/i);
            }
        }
    });

    it("never reads back the different-songs tile", () => {
        for (const hours of [0.5, 4, 12, 25]) {
            const line = weekLine(stats(hours, 38, 1), true);

            expect(line).not.toContain("38");
            expect(line).not.toMatch(/different songs/i);
        }
    });

    it("says something for every shape of week", () => {
        for (const hours of [0.1, 1, 3, 9.9, 10, 19.9, 20, 40]) {
            const line = weekLine(stats(hours, 12, 1), true);

            expect(line.length).toBeGreaterThan(0);
            expect(line).toMatch(/[.!]$/);
        }
    });

    it("addresses a friend's profile in the third person", () => {
        expect(weekLine(stats(25, 90, 2), false)).toContain("Their");
        expect(weekLine(stats(25, 90, 2), true)).toContain("Your");
    });
});
