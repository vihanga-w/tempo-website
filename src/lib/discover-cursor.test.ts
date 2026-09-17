import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FeedItem } from "./usrlib";
import {
    CURSOR_SEARCH_PAGES, QUARTER_MS, cutAfter, hashKey, lastHashOf, quarterOf, readCursor, searchPage, writeCursor,
    type CursorSearch, type CursorStore,
} from "./discover-cursor";

vi.mock("@capacitor/preferences", () => ({ Preferences: { get: vi.fn(), set: vi.fn() } }));

function pick(id: string): FeedItem {
    return {
        type: "discover",
        data: { id, title: "Song " + id, artists: ["Artist"], album: "Album", imageUrl: `/art/${id}.jpg`, likeness: 0.5 },
    };
}

function milestone(id: string): FeedItem {
    return { type: "alert", data: { id, alertType: "ListenerTypeChange", content: "Audiophile" } };
}

function memory(initial: string | null = null): CursorStore & { value: string | null } {
    const store = {
        value: initial,
        get: async () => store.value,
        set: async (value: string) => { store.value = value; },
    };

    return store;
}

const NOW = 1_700_000_000_000;

/**
 * The mark is what keeps Discover from dealing the same page again when the
 * tab is reopened inside the server's quarter-hour. It has to be a stable name
 * for a song, find that song anywhere on a page, know when a page has nothing
 * new, and be forgotten the moment the server's order can no longer be
 * trusted to hold.
 */
describe("the mark", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => { });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("names a song the same way every time, and no other song that way", () => {
        expect(hashKey("song:abc")).toBe(hashKey("song:abc"));
        expect(hashKey("song:abc")).not.toBe(hashKey("song:abd"));
        expect(hashKey("song:abc")).toMatch(/^[0-9a-f]{16}$/);
    });

    it("is the last song on a page, and nothing on a page with no songs", () => {
        expect(lastHashOf([milestone("m"), pick("a"), pick("b")])).toBe(hashKey("song:b"));
        // The last page carries the alerts and nothing else, and must leave no mark
        expect(lastHashOf([milestone("m")])).toBeNull();
        expect(lastHashOf([])).toBeNull();
    });

    it("cuts a page to what comes after it", () => {
        const page = [milestone("m"), pick("a"), pick("b"), pick("c")];

        expect(cutAfter(page, hashKey("song:a"))).toEqual([pick("b"), pick("c")]);
    });

    it("leaves nothing of a page that ends with it: all seen", () => {
        expect(cutAfter([pick("a"), pick("b")], hashKey("song:b"))).toEqual([]);
    });

    it("says when it is not on a page at all, which is not the same as nothing new", () => {
        expect(cutAfter([pick("a"), pick("b")], hashKey("song:z"))).toBeNull();
    });

});

/**
 * Reopened inside the quarter-hour, Discover is dealt the same pages in the
 * same order. The search reads them one at a time: it must show nothing it
 * has already dealt, find the mark however deep a reader got, and, when the
 * mark is nowhere, show everything rather than nothing.
 */
describe("searching the pages for the mark", () => {
    const fresh = (hash: string): CursorSearch => ({ hash, held: [], pages: 0 });

    it("deals what follows the mark on the page that has it", () => {
        const step = searchPage(fresh(hashKey("song:b")), [milestone("m"), pick("a"), pick("b"), pick("c")]);

        expect(step).toEqual({ kind: "found", items: [pick("c")] });
    });

    it("deals nothing from a page that ends with the mark, and keeps going", () => {
        // Nothing new here; the next page may still hold something
        expect(searchPage(fresh(hashKey("song:b")), [pick("a"), pick("b")])).toEqual({ kind: "found", items: [] });
    });

    it("holds a page without the mark back, for a reader who got further than a page", () => {
        const step = searchPage(fresh(hashKey("song:z")), [pick("a"), pick("b")]);

        expect(step.kind).toBe("hold");
        if (step.kind !== "hold")
            throw new Error("expected the page held");

        expect(step.search).toEqual({ hash: hashKey("song:z"), held: [pick("a"), pick("b")], pages: 1 });

        // The held pages are what had been seen: found further in, they are dropped
        expect(searchPage(step.search, [pick("z"), pick("c")])).toEqual({ kind: "found", items: [pick("c")] });
    });

    it("gives up at the end of the feed and deals everything it held: the order has changed", () => {
        const held = searchPage(fresh(hashKey("song:z")), [pick("a")]);

        if (held.kind !== "hold")
            throw new Error("expected the page held");

        // The last page carries only the alerts
        expect(searchPage(held.search, [milestone("m")])).toEqual({ kind: "gave-up", items: [pick("a"), milestone("m")] });
    });

    it("gives up after enough pages, each one a request spent showing nothing", () => {
        let search = fresh(hashKey("song:z"));

        for (let page = 1; page < CURSOR_SEARCH_PAGES; page++) {
            const step = searchPage(search, [pick("p" + page)]);

            expect(step.kind).toBe("hold");
            if (step.kind !== "hold")
                throw new Error("expected the page held");

            search = step.search;
        }

        const last = searchPage(search, [pick("p" + CURSOR_SEARCH_PAGES)]);

        expect(last.kind).toBe("gave-up");
        if (last.kind !== "gave-up")
            throw new Error("expected the search given up");

        expect(last.items.map(item => (item.data as { id: string }).id)).toEqual(
            Array.from({ length: CURSOR_SEARCH_PAGES }, (_, i) => "p" + (i + 1)),
        );
    });
});

describe("keeping the mark", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => { });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("comes back inside the quarter of an hour it was left in", async () => {
        const store = memory();

        await writeCursor("abc", store, NOW);

        expect(await readCursor(store, NOW + 60e3)).toBe("abc");
    });

    it("is forgotten once the server has reshuffled", async () => {
        const store = memory();
        const at = quarterOf(NOW) * QUARTER_MS + 14 * 60e3;

        await writeCursor("abc", store, at);

        // A minute later is the next quarter, and a different order
        expect(await readCursor(store, at + 2 * 60e3)).toBeNull();
    });

    it("turns over on the clock's quarters, which every timezone shares", () => {
        expect(quarterOf(QUARTER_MS * 5 - 1)).toBe(4);
        expect(quarterOf(QUARTER_MS * 5)).toBe(5);
    });

    it("reads a record it cannot make sense of as no mark", async () => {
        expect(await readCursor(memory("not json"), NOW)).toBeNull();
        expect(await readCursor(memory(JSON.stringify({ quarter: quarterOf(NOW) })), NOW)).toBeNull();
        expect(await readCursor(memory(), NOW)).toBeNull();
    });

    it("survives storage refusing, on the way in and the way out", async () => {
        const broken: CursorStore = {
            get: async () => { throw new Error("no"); },
            set: async () => { throw new Error("no"); },
        };

        await expect(writeCursor("abc", broken, NOW)).resolves.toBeUndefined();
        await expect(readCursor(broken, NOW)).resolves.toBeNull();
    });
});
