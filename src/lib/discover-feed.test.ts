import { describe, expect, it } from "vitest";

import { appendPage, isLastPage, playNote, sinceShort, toCard, type DiscoverCard } from "./discover-feed";
import type { FeedItem } from "./usrlib";

function pick(id: string, likeness: number): FeedItem {
    return {
        type: "discover",
        data: { id, title: "Song " + id, artists: ["Artist"], album: "Album", imageUrl: `/art/${id}.jpg`, likeness },
    };
}

function play(id: string, over: Partial<{ replayed: boolean; skipped: boolean; sessionDuration: number }> = {}): FeedItem {
    return {
        type: "history",
        data: {
            userId: "friend1",
            username: "Alex",
            timestamp: 1_000,
            item: {
                track: {
                    id, name: "Song " + id, artists: [{ id: "a", name: "Artist", url: "", uri: "" }],
                    duration: 200_000, explicit: true,
                    album: { id: "al", name: "Album", releaseDate: 0, artUrl: `/art/${id}.jpg` },
                    type: "track", meta: { updatedAt: 0 },
                },
                sessionDuration: over.sessionDuration ?? 1,
                skipped: over.skipped ?? false,
                replayed: over.replayed ?? false,
            },
        },
    };
}

function milestone(id: string, content: unknown = "Audiophile"): FeedItem {
    return { type: "alert", data: { id, alertType: "ListenerTypeChange", content } };
}

const keys = (cards: DiscoverCard[]) => cards.map(card => card.key);

describe("toCard", () => {
    it("tells a taste pick from a friend's pick by the likeness the server gives it", () => {
        const taste = toCard(pick("t", 0.82));
        const friends = toCard(pick("f", 1.6));

        expect(taste?.kind === "song" && taste.reason).toEqual({ type: "taste", match: 0.82 });
        expect(friends?.kind === "song" && friends.reason).toEqual({ type: "friend-pick" });
    });

    it("keeps who played a friend's play, and how", () => {
        const card = toCard(play("p", { replayed: true, sessionDuration: 0.4 }));

        expect(card?.kind).toBe("song");
        if (card?.kind !== "song" || card.reason.type !== "friend-play")
            throw new Error("expected a friend's play");

        expect(card.song).toMatchObject({ id: "p", title: "Song p", artists: ["Artist"], imageUrl: "/art/p.jpg", explicit: true });
        expect(card.reason.friend).toMatchObject({ username: "Alex", playedAt: 1_000, heard: 0.4, replayed: true });
    });

    it("makes a card of a milestone, and of nothing For You used as filler", () => {
        expect(toCard(milestone("m1"))).toEqual({ kind: "milestone", key: "alert:m1", alertId: "m1", tier: "Audiophile" });
        expect(toCard({ type: "alert", data: { id: "loading", alertType: "ContentLoading", content: "" } })).toBeNull();
        expect(toCard({ type: "alert", data: { id: "activity", alertType: "ActivityPage", content: "" } })).toBeNull();
    });

    it("gives a milestone with no tier a name rather than a blank", () => {
        const card = toCard(milestone("m2", ""));

        expect(card?.kind === "milestone" && card.tier).toBe("New tier");
    });
});

describe("appendPage", () => {
    it("shows a song once, however often the reshuffled feed sends it", () => {
        const first = appendPage([], [pick("a", 0.9), pick("b", 0.8)]);
        const second = appendPage(first, [pick("b", 0.8), pick("c", 0.7)]);

        expect(keys(second)).toEqual(["song:a", "song:b", "song:c"]);
    });

    it("keeps one of each milestone, though every page carries them all", () => {
        const first = appendPage([], [milestone("m1"), pick("a", 0.9)]);
        const second = appendPage(first, [milestone("m1"), pick("b", 0.9)]);

        expect(keys(second)).toEqual(["alert:m1", "song:a", "song:b"]);
    });

    it("puts a page's milestones before its songs", () => {
        expect(keys(appendPage([], [pick("a", 0.9), milestone("m1")]))).toEqual(["alert:m1", "song:a"]);
    });

    it("prefers a friend's play to a pick of the same song, in the pick's place", () => {
        const cards = appendPage([], [pick("a", 1.5), pick("b", 0.9), play("a")]);

        expect(keys(cards)).toEqual(["song:a", "song:b"]);
        expect(cards[0].kind === "song" && cards[0].reason.type).toBe("friend-play");
    });
});

describe("isLastPage", () => {
    it("is the end when a page has no songs, even with milestones on it", () => {
        expect(isLastPage([])).toBe(true);
        expect(isLastPage(null)).toBe(true);
        expect(isLastPage([milestone("m1")])).toBe(true);
        expect(isLastPage([milestone("m1"), pick("a", 0.5)])).toBe(false);
        expect(isLastPage([play("a")])).toBe(false);
    });
});

describe("the words on a friend's card", () => {
    const friend = { userId: "f", username: "Alex", playedAt: 0, heard: 1, replayed: false, skipped: false };

    it("says the strongest thing about how they played it", () => {
        expect(playNote({ ...friend, replayed: true, skipped: true })).toBe("on repeat");
        expect(playNote({ ...friend, skipped: true })).toBe("skipped it");
        expect(playNote(friend)).toBe("played it through");
        expect(playNote({ ...friend, heard: 0.42 })).toBe("heard 42%");
    });

    it("says when, briefly", () => {
        expect(sinceShort(0, 30e3)).toBe("just now");
        expect(sinceShort(0, 4 * 60e3)).toBe("4m ago");
        expect(sinceShort(0, 3 * 3600e3)).toBe("3h ago");
        expect(sinceShort(0, 50 * 3600e3)).toBe("2d ago");
    });
});
