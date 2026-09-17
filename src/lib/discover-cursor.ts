import { Preferences } from "@capacitor/preferences";

import type { FeedItem } from "./usrlib";
import { isLastPage, toCard } from "./discover-feed";

/**
 * Where Discover's last fetch got to, kept on the device.
 *
 * Discover starts from the server's first page every time the tab is opened,
 * and the server's order holds for a quarter of an hour: leave the tab and come
 * back inside one, and the same twenty songs are dealt again. This is the mark
 * that says how far the reader has already got.
 *
 * It is a hash of the last song the reader dealt with, written as they pass
 * it. Read back, it cuts the feed: a page that ends with it has all been
 * seen, a page with it in the middle has new songs after it, and a page
 * without it is held back while later pages are looked through for it, since
 * a reader who got through more than a page will find it further in. If the
 * feed runs out, or the search goes on too long, the order has changed under
 * the mark and everything held is shown from the start.
 *
 * The server reseeds its shuffle every quarter of an hour, on the clock, so a
 * mark is trusted only within the quarter it was written in, and the quarter
 * is kept with it. Fifteen minutes divides every timezone's offset, so the
 * client's quarter and the server's turn over at the same instant wherever
 * either of them is.
 */

export const DISCOVER_CURSOR_KEY = "tempo.discover.last";
/** The server's reshuffle interval. */
export const QUARTER_MS = 15 * 60e3;
/**
 * How many pages are looked through for the mark before the order is taken to
 * have changed. The pool is up to thirteen pages; six is more than anybody
 * gets through in a quarter of an hour, and each one is a request spent
 * showing nothing.
 */
export const CURSOR_SEARCH_PAGES = 6;

export interface DiscoverCursor {
    hash: string;
    quarter: number;
}

/** Which quarter of an hour this instant falls in, counted from the epoch. */
export function quarterOf(now: number): number {
    return Math.floor(now / QUARTER_MS);
}

/**
 * A short, stable hash of a card's key.
 *
 * FNV-1a, run twice from different bases for sixteen hex characters: enough
 * that two songs in a pool of a few hundred will not share one, and the mark
 * is not a song's id in the clear.
 */
export function hashKey(key: string): string {
    const fnv = (basis: number) => {
        let hash = basis >>> 0;

        for (let i = 0; i < key.length; i++) {
            hash ^= key.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }

        return hash.toString(16).padStart(8, "0");
    };

    return fnv(0x811c9dc5) + fnv(0x050c5d1f);
}

/** The keys of a page's songs, in order. Alerts are on the front of every page and mark nothing. */
function songKeys(items: readonly FeedItem[]): string[] {
    const keys: string[] = [];

    for (const item of items) {
        const card = toCard(item);

        if (card?.kind === "song")
            keys.push(card.key);
    }

    return keys;
}

/** The mark a fetched page leaves: its last song's hash, or null if it has no songs. */
export function lastHashOf(items: readonly FeedItem[]): string | null {
    const keys = songKeys(items);

    return (keys.length ? hashKey(keys[keys.length - 1]) : null);
}

/**
 * What is new on a page: everything after the mark, if the mark is on it.
 *
 * Null when it is not, which is not the same as nothing: the page may be one
 * that was all seen before the mark, or the order may have changed.
 */
export function cutAfter(items: readonly FeedItem[], hash: string): FeedItem[] | null {
    let at = -1;

    items.forEach((item, i) => {
        const card = toCard(item);

        if (card?.kind === "song" && hashKey(card.key) === hash)
            at = i;
    });

    if (at < 0)
        return null;

    return items.slice(at + 1);
}

/** A search for the mark across pages, and the pages held back while it goes on. */
export interface CursorSearch {
    hash: string;
    held: FeedItem[];
    /** Pages looked through so far. */
    pages: number;
}

export type SearchStep =
    /** Not on this page, and worth looking further: the page is held back. */
    | { kind: "hold"; search: CursorSearch }
    /** On this page: what follows it is new, and what was held had been seen. */
    | { kind: "found"; items: FeedItem[] }
    /** Not anywhere it should have been: the order has changed, and everything held is new after all. */
    | { kind: "gave-up"; items: FeedItem[] };

/**
 * One page into the search.
 *
 * The search ends on the last page whatever it holds — there is nothing
 * further to look through — and after CURSOR_SEARCH_PAGES, since each page
 * looked through is a request spent showing nothing.
 */
export function searchPage(search: CursorSearch, page: readonly FeedItem[]): SearchStep {
    const after = cutAfter(page, search.hash);

    if (after)
        return { kind: "found", items: after };

    const pages = search.pages + 1;

    if (isLastPage(page) || pages >= CURSOR_SEARCH_PAGES)
        return { kind: "gave-up", items: [...search.held, ...page] };

    return { kind: "hold", search: { hash: search.hash, held: [...search.held, ...page], pages } };
}

/** Somewhere to keep the mark: the app's storage, or a stand-in for a test. */
export interface CursorStore {
    get(): Promise<string | null>;
    set(value: string): Promise<void>;
}

/** The app's own storage, which is the device's on a phone and localStorage on the web. */
export const preferencesStore: CursorStore = {
    get: async () => (await Preferences.get({ key: DISCOVER_CURSOR_KEY })).value,
    set: value => Preferences.set({ key: DISCOVER_CURSOR_KEY, value }),
};

/**
 * The mark, if it was left in this quarter of an hour.
 *
 * Anything else — a mark from an earlier quarter, a record that cannot be
 * read, storage that refuses — reads as no mark: the feed is dealt from the
 * start, which is what Discover always did.
 */
export async function readCursor(store: CursorStore = preferencesStore, now: number = Date.now()): Promise<string | null> {
    try {
        const raw = await store.get();

        if (!raw)
            return null;

        const cursor = JSON.parse(raw) as Partial<DiscoverCursor>;

        if (typeof cursor.hash !== "string" || cursor.quarter !== quarterOf(now))
            return null;

        return cursor.hash;
    } catch (ex) {
        console.warn("Could not read where Discover had got to, error:", ex);

        return null;
    }
}

/** Leave the mark, with the quarter it was left in. A refusal costs only the next opening. */
export async function writeCursor(hash: string, store: CursorStore = preferencesStore, now: number = Date.now()): Promise<void> {
    try {
        await store.set(JSON.stringify({ hash, quarter: quarterOf(now) } satisfies DiscoverCursor));
    } catch (ex) {
        console.warn("Could not record where Discover got to, error:", ex);
    }
}
