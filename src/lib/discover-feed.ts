/**
 * Discover's cards, from what the feed endpoint sends.
 *
 * Discover and For You were one endpoint asked for two mixes: For You mostly
 * friends' plays, Discover only picks. Asked for neither, the server sends both
 * at about half and half, which is the page this now is — so the blend is the
 * server's, and what is left to do here is make its items into one kind of
 * thing and survive the feed's quirks:
 *
 *   - The server reshuffles its pool every quarter of an hour, so a page can
 *     repeat a song from an earlier one. Cards are keyed, and a key already
 *     shown is not shown twice.
 *   - Every alert is put on the front of every page. The same key rule keeps
 *     one of each.
 *   - There is no "has more". A page with no songs on it is the end.
 *   - A friend's play and a friend's pick can be the same song, since picks are
 *     made from plays. The play wins: it says who, and when.
 */

import type { FeedItem, FeedItemAlert, FeedItemHistory, Song } from "./usrlib";

/** Who a song came from, when a friend is the reason for it. */
export interface DiscoverFriend {
    userId: string;
    username: string;
    pfpUrl?: string;
    pfpBlurHash?: string;
    pfpColourBlob?: string;
    playedAt: number;
    /** How much of it they heard, 0 to 1. */
    heard: number;
    replayed: boolean;
    skipped: boolean;
}

export interface DiscoverSong {
    id: string;
    title: string;
    artists: string[];
    imageUrl: string;
    previewUrl?: string;
    explicit?: boolean;
}

export type DiscoverCard =
    | {
        kind: "song";
        key: string;
        song: DiscoverSong;
        /**
         * Why it is here. A taste pick says how close it is to what you play; a
         * friend's play says who. A friend's pick has neither — the server does
         * not say which friend — so it says only that it came from friends.
         */
        reason:
            | { type: "taste"; match: number }
            | { type: "friend-pick" }
            | { type: "friend-play"; friend: DiscoverFriend };
    }
    | { kind: "milestone"; key: string; alertId: string; tier: string };

/**
 * A taste pick's likeness is a cosine similarity, at most 1. A friend's pick is
 * given 1 to 2 by the server so that it always sorts first, which makes anything
 * over 1 a friend's pick rather than a better match.
 */
const FRIEND_PICK_FLOOR = 1;

export function toCard(item: FeedItem): DiscoverCard | null {
    if (item.type === "alert") {
        const alert = item.data as FeedItemAlert;

        // The loading and activity placeholders were For You's own; only a real
        // milestone is worth a card
        if (alert.alertType !== "ListenerTypeChange" || !alert.id)
            return null;

        return {
            kind: "milestone",
            key: "alert:" + alert.id,
            alertId: alert.id,
            tier: typeof alert.content === "string" && alert.content.trim() ? alert.content : "New tier",
        };
    }

    if (item.type === "history") {
        const play = item.data as FeedItemHistory;
        const track = play?.item?.track;

        if (!track?.id)
            return null;

        return {
            kind: "song",
            key: "song:" + track.id,
            song: {
                id: track.id,
                title: track.name,
                artists: (track.artists ?? []).map(artist => artist.name),
                imageUrl: track.album?.artUrl ?? "",
                previewUrl: play.previewUrl,
                explicit: track.explicit,
            },
            reason: {
                type: "friend-play",
                friend: {
                    userId: play.userId,
                    username: play.username,
                    pfpUrl: play.pfpUrl,
                    pfpBlurHash: play.pfpBlurHash,
                    pfpColourBlob: play.pfpColourBlob,
                    playedAt: play.timestamp,
                    heard: Math.max(0, Math.min(1, play.item.sessionDuration ?? 0)),
                    replayed: !!play.item.replayed,
                    skipped: !!play.item.skipped,
                },
            },
        };
    }

    if (item.type === "discover") {
        const pick = item.data as Song;

        if (!pick?.id)
            return null;

        const likeness = Number.isFinite(pick.likeness) ? pick.likeness : 0;

        return {
            kind: "song",
            key: "song:" + pick.id,
            song: {
                id: pick.id,
                title: pick.title,
                artists: pick.artists ?? [],
                imageUrl: pick.imageUrl,
                previewUrl: pick.previewUrl,
            },
            reason: likeness > FRIEND_PICK_FLOOR
                ? { type: "friend-pick" }
                : { type: "taste", match: Math.max(0, Math.min(1, likeness)) },
        };
    }

    return null;
}

/** Whether a page from the server has run out: no songs on it, whatever else it carries. */
export function isLastPage(items: readonly FeedItem[] | null | undefined): boolean {
    return !(items ?? []).some(item => item.type === "history" || item.type === "discover");
}

/**
 * A page's cards, after the ones already shown.
 *
 * Milestones go first, where the server put them, and songs keep the server's
 * order. Within a page a friend's play takes the place of a pick of the same
 * song, wherever the pick fell.
 */
export function appendPage(shown: readonly DiscoverCard[], items: readonly FeedItem[]): DiscoverCard[] {
    const seen = new Set(shown.map(card => card.key));
    const incoming: DiscoverCard[] = [];
    const at = new Map<string, number>();

    for (const item of items) {
        const card = toCard(item);

        if (!card || seen.has(card.key))
            continue;

        const earlier = at.get(card.key);

        if (earlier === undefined) {
            at.set(card.key, incoming.length);
            incoming.push(card);

            continue;
        }

        const existing = incoming[earlier];

        if (card.kind === "song" && existing.kind === "song"
            && card.reason.type === "friend-play" && existing.reason.type !== "friend-play")
            incoming[earlier] = card;
    }

    const milestones = incoming.filter(card => card.kind === "milestone");
    const songs = incoming.filter(card => card.kind === "song");

    return [...shown, ...milestones, ...songs];
}

/** "4m", "3h", "2d": short, because it shares a line with a name. */
export function sinceShort(at: number, now: number): string {
    const minutes = Math.max(0, Math.floor((now - at) / 60e3));

    if (minutes < 1)
        return "just now";

    if (minutes < 60)
        return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);

    if (hours < 24)
        return `${hours}h ago`;

    return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The one line under a friend's name that says how they played it.
 *
 * What they did is the useful part — a song somebody put on twice is a better
 * recommendation than one they let run in the background — so the strongest
 * signal is the one said.
 */
export function playNote(friend: DiscoverFriend): string {
    if (friend.replayed)
        return "on repeat";

    if (friend.skipped)
        return "skipped it";

    if (friend.heard >= 0.9)
        return "played it through";

    return `heard ${Math.max(1, Math.round(friend.heard * 100))}%`;
}
