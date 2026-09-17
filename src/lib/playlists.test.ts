import { describe, expect, it } from "vitest";

import { reasonLine, recipeNamed, refreshLine, songCount } from "./playlists";

const NOW = 1_700_000_000_000;
const HOUR = 3600e3;

/**
 * The reason line is the whole point of a Tempo playlist: it says what
 * happened, who did it and when, in words a friend would use.
 */
describe("the reason a song is there", () => {
    it("says a like was a like, and when", () => {
        expect(reasonLine({ type: "liked", at: NOW - 2 * HOUR, strength: 4 }, NOW)).toBe("You liked this in Discover · 2h ago");
    });

    it("names the friend and what they did with it", () => {
        expect(reasonLine({ type: "friend", userId: "u", username: "Maya", how: "repeat", at: NOW - 60e3, others: 0 }, NOW))
            .toBe("Maya had this on repeat · just now");
        expect(reasonLine({ type: "friend", userId: "u", username: "Jon", how: "through", at: NOW - 30 * HOUR, others: 1 }, NOW))
            .toBe("Jon played it through and 1 other · yesterday");
        expect(reasonLine({ type: "friend", userId: "u", username: "Sam", how: "played", at: NOW - 3 * 24 * HOUR, others: 3 }, NOW))
            .toBe("Sam played this and 3 others · 3d ago");
    });

    it("counts the days somebody came back, and the plays they gave it", () => {
        expect(reasonLine({ type: "returned", days: 3, lastAt: NOW - HOUR }, NOW)).toBe("You came back to this on 3 different days · 1h ago");
        expect(reasonLine({ type: "played", plays: 1, replays: 0, lastAt: NOW - HOUR }, NOW)).toBe("You played this once · 1h ago");
        expect(reasonLine({ type: "played", plays: 2, replays: 0, lastAt: NOW - HOUR }, NOW)).toBe("You played this twice · 1h ago");
        expect(reasonLine({ type: "played", plays: 5, replays: 2, lastAt: NOW - HOUR }, NOW)).toBe("You played this 5 times, 2 on repeat · 1h ago");
    });
});

describe("a reason that can no longer be told", () => {
    it("says only that the song is here, and since when", () => {
        expect(reasonLine({ type: "kept", at: NOW - 3 * 24 * HOUR }, NOW)).toBe("In this playlist · 3d ago");
    });
});

describe("when a playlist is next refreshed", () => {
    it("names the day, or says it is due", () => {
        const DAY = 24 * HOUR;
        // NOW is a Tuesday evening UTC; three days on is a Friday in every zone within a day of it
        expect(refreshLine(NOW + 3 * DAY, NOW)).toMatch(/^Refreshed every week · next (Friday|Saturday|Thursday)\.$/);
        expect(refreshLine(NOW + HOUR, NOW)).toBe("Refreshed every week · next tomorrow.");
        expect(refreshLine(NOW - HOUR, NOW)).toBe("Refreshed every week · due now.");
        expect(refreshLine(undefined, NOW)).toBe("Refreshed every week.");
    });
});

describe("the small words", () => {
    it("counts songs", () => {
        expect(songCount(0)).toBe("No songs");
        expect(songCount(1)).toBe("1 song");
        expect(songCount(12)).toBe("12 songs");
    });

    it("names a recipe, and has a name for one it does not know", () => {
        expect(recipeNamed("friends").name).toBe("On repeat with friends");
        expect(recipeNamed("nope" as never).name).toBe("Playlist");
    });
});
