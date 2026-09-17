import { describeWhen } from "@/components/friend-recent-activity-row";
import { RateLimitedError } from "./rate-limit";

/**
 * Playlists, as the server keeps them: made from what only Tempo knows, and
 * every song carrying the reason it is there. The recipes and the reasons
 * mirror the server's playlist-builder; the words for them live here.
 */

export type PlaylistRecipe = "liked" | "friends" | "returned" | "mix";

export const RECIPES: { id: PlaylistRecipe; name: string; blurb: string }[] = [
    { id: "liked", name: "Liked in Discover", blurb: "Everything you swiped right on, newest first." },
    { id: "friends", name: "On repeat with friends", blurb: "What your friends kept playing this week." },
    { id: "returned", name: "On repeat with Tempo", blurb: "The songs you keep coming back to." },
    { id: "mix", name: "Your mix", blurb: "Likes, your plays and your friends', weighed together." },
];

export function recipeNamed(recipe: PlaylistRecipe): { name: string; blurb: string } {
    return RECIPES.find(v => v.id === recipe) ?? { name: "Playlist", blurb: "" };
}

export type PlaylistReason =
    | { type: "liked"; at: number; strength: number }
    | { type: "friend"; userId: string; username: string; how: "repeat" | "through" | "played"; at: number; others: number }
    | { type: "returned"; days: number; lastAt: number }
    | { type: "played"; plays: number; replays: number; lastAt: number }
    /** A friend's reason the listener may no longer be shown: the friend has stopped sharing, or being one. */
    | { type: "kept"; at: number };

export interface PlaylistSong {
    id: string;
    title: string;
    artists: string[];
    imageUrl: string;
    explicit?: boolean;
    reason: PlaylistReason;
    addedAt: number;
}

export interface SpotifyCopy {
    id: string;
    url: string;
    syncedAt: number;
}

export interface PlaylistSummary {
    id: string;
    name: string;
    recipe: PlaylistRecipe;
    createdAt: number;
    updatedAt: number;
    songCount: number;
    spotify?: SpotifyCopy;
}

export interface Playlist {
    id: string;
    name: string;
    recipe: PlaylistRecipe;
    createdAt: number;
    updatedAt: number;
    /** When the server will next rebuild it from its recipe, Spotify copy and all. */
    refreshesAt?: number;
    spotify?: SpotifyCopy;
    songs: PlaylistSong[];
}

/** Sending a playlist to Spotify needs a permission this account has not granted: a sign-in, not a retry. */
export class PlaylistNeedsSignInError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PlaylistNeedsSignInError";
    }
}

/**
 * Why a song is in a playlist, as one line under its name.
 *
 * Said as what happened, with who and when: a playlist's whole point here is
 * that it can say "Maya had this on repeat", which no other playlist can.
 */
export function reasonLine(reason: PlaylistReason, now: number = Date.now()): string {
    switch (reason.type) {
        case "liked":
            return `You liked this in Discover · ${describeWhen(reason.at, now)}`;

        case "friend": {
            const did = reason.how === "repeat" ? "had this on repeat"
                : reason.how === "through" ? "played it through"
                    : "played this";
            const others = reason.others <= 0 ? ""
                : reason.others === 1 ? " and 1 other"
                    : ` and ${reason.others} others`;

            return `${reason.username} ${did}${others} · ${describeWhen(reason.at, now)}`;
        }

        case "returned":
            return `You came back to this on ${reason.days} different days · ${describeWhen(reason.lastAt, now)}`;

        case "played": {
            const times = reason.plays === 1 ? "once" : reason.plays === 2 ? "twice" : `${reason.plays} times`;
            const repeats = reason.replays > 0 ? `, ${reason.replays} on repeat` : "";

            return `You played this ${times}${repeats} · ${describeWhen(reason.lastAt, now)}`;
        }

        case "kept":
            return `In this playlist · ${describeWhen(reason.at, now)}`;
    }
}

/**
 * What went wrong, in a sentence the page can show.
 *
 * The rate limiter's error names the URL it was waiting on, which is for the
 * log, not the screen; the server's messages and the sign-in refusal are
 * written to be shown. Anything else gets the page's own fallback.
 */
export function describeError(ex: unknown, fallback: string): string {
    if (ex instanceof RateLimitedError)
        return "Tempo is busy just now. Try again in a moment.";

    if (ex instanceof Error && ex.message)
        return ex.message;

    return fallback;
}

/** "Refreshed every week · next Tuesday", or just the first half without a date. */
export function refreshLine(refreshesAt: number | undefined, now: number = Date.now()): string {
    if (refreshesAt === undefined)
        return "Refreshed every week.";

    const days = Math.ceil((refreshesAt - now) / (24 * 3600e3));

    if (days <= 0)
        return "Refreshed every week · due now.";

    if (days === 1)
        return "Refreshed every week · next tomorrow.";

    return `Refreshed every week · next ${new Date(refreshesAt).toLocaleDateString(undefined, { weekday: "long" })}.`;
}

/** "12 songs", "1 song", "No songs". */
export function songCount(count: number): string {
    if (count === 0)
        return "No songs";

    return `${count} ${count === 1 ? "song" : "songs"}`;
}
