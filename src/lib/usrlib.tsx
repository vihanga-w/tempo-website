import EventEmitter from "events";
import {
    API_URL, ME_CACHE_KEY, ME_FRIENDS_CACHE_KEY, PROFILE_STATS_CACHE_MS, KNOWN_USER_KEY,
    APP_CLIENT_VERSION,
} from "./const";
import { Recap } from "@/components/recap-drawer";
import { FaF } from "react-icons/fa6";
import { DataStreamer } from "./live-ingest";
import { getCachedObject, setCachedObject } from "./client-cache";
import { fetchThroughRateLimit, rateLimitPauseMs, backoffPauseMs, RateLimitedError } from "./rate-limit";
import { PlaylistNeedsSignInError, type Playlist, type PlaylistRecipe, type PlaylistSong, type PlaylistSummary } from "./playlists";
import { forgetAppleMusicHere, refreshAppleMusicLink } from "./apple-music";

/** A pick, as the feed sends it: a taste pick, or a friends' pick with likeness over 1. See lib/discover-feed.ts. */
export interface Song {
    id: string;
    title: string;
    artists: string[];
    album: string;
    imageUrl: string;
    previewUrl?: string;
    likeness: number;
}

export interface UserSettings {
    shareListeningActivity: boolean;
}

export interface FeedItemAlert {
    id: string;
    alertType: "ListenerTypeChange" | "ActivityPage" | "ContentLoading";
    content: any;
}

export interface FeedItemHistory {
    userId: string;
    username: string;
    pfpUrl?: string;
    /**
     * See the server's profile-blob — drawn until pfpUrl loads, so there is no
     * gap where an avatar will be.
     *
     * The feed has always sent this; the type simply never said so, and the one
     * place that reads it was enough to fail the production build while `next
     * dev` went on serving the page quite happily.
     */
    pfpColourBlob?: string;
    /** The same picture as a BlurHash; preferred when present. */
    pfpBlurHash?: string;
    previewUrl?: string;
    item: {
        track: SongData;
        sessionDuration: number;
        skipped: boolean;
        replayed: boolean;
    };
    timestamp: number;
};

export interface FeedItem {
    type: "history" | "discover" | "alert";
    data: FeedItemHistory | Song | FeedItemAlert;
}

export interface UserFriendship {
    id: string;
    u1Id: string;
    u2Id: string;
    stats: {
        streak: number;
        tasteMatchScore: number;
    };
    state: "request" | "incoming" | "friends" | "blocked";
}

// The client-safe user account object
export type ClientUserAccount = {
    country: string
    display_name: string
    email: string
    explicit_content: {
        filter_enabled: boolean
        filter_locked: boolean
    }
    external_urls: {
        spotify: string
    }
    followers: {
        href: any
        total: number
    }
    listenerTypeClassification: string
    /** The picture reduced to a 4x4 grid of colours; see lib/colour-blob.ts. */
    profilePictureColourBlob?: string
    /** The same picture as a BlurHash; preferred when present. */
    profilePictureBlurHash?: string
    href: string
    id: string
    images: Array<{
        height: number
        url: string
        width: number
    }>
    product: string
    type: string
    uri: string
    displayName: string
}

export interface SongData {
    id: string;
    name: string;
    artists: {
        id: string;
        name: string;
        url: string;
        uri: string;
    }[];
    duration: number;
    explicit: boolean;
    album: {
        id: string;
        name: string;
        releaseDate: number;
        artUrl: string;
    }
    type: "episode" | "track",
    meta: {
        updatedAt: number;
    }
}

/** One track in a friend's recent activity, as the server sends it. */
export interface RecentActivityTrack {
    songId: string;
    timestamp: number;
    replayed: boolean;
    track: SongData;
}

/** What one friend was listening to before they stopped. */
export interface FriendRecentActivity {
    userId: string;
    username: string;
    pfpUrl?: string;
    pfpColourBlob?: string;
    /** The same picture as a BlurHash; preferred when present. */
    pfpBlurHash?: string;
    /** Newest first, capped by the server. */
    tracks: RecentActivityTrack[];
    lastPlayedAt: number;
    /** How many plays there were, which can exceed tracks.length. */
    playCount: number;
    onRepeat: boolean;
}

export interface FriendListenershipItem {
    userId: string;
    username: string;
    pfpUrl: string;
    pfpColourBlob?: string;
    /** The same picture as a BlurHash; preferred when present. */
    pfpBlurHash?: string;
    item: {
        track: SongData;
        sessionDuration: number;
        skipped: boolean;
        replayed: boolean;
    };
    timestamp: number;
};

export type EncryptionAvailability = {
    configured: boolean;
    keyId: string;
}

export default class User extends EventEmitter {
    public isLoggedIn: boolean = false;
    public authError: boolean = false;
    /**
     * Whether the last session check went unanswered.
     *
     * A rate-limited /chkauth is not a "no" - see isUserAuthenticated - but it
     * is not a "yes" either, and something has to remember which it was. A
     * cached account is up to two days old, so handing it over when neither
     * endpoint could answer would let an expired session into the signed-in
     * interface on the strength of nothing at all.
     */
    private sessionUnconfirmed: boolean = false;
    public id: string = "";
    public email: string = "";
    public object: ClientUserAccount | undefined;
    public storedToken?: string;
    public friends: {
        user: ClientUserAccount;
        friendship: UserFriendship;
    }[] = [];
    public friendsSessionsCount: number;
    public settings: UserSettings;

    constructor() {
        super();

        const storedToken = window.localStorage.getItem("tempo.a");

        if (storedToken)
            this.storedToken = storedToken;

        this.friendsSessionsCount = 0;
        this.settings = {
            shareListeningActivity: true,
        }
    }

    async init(storedToken?: string): Promise<void> {
        this.storedToken = storedToken;

        let perfMsg = await this.getPerfMessage();

        while (perfMsg) {
            this.emit("performance-message", perfMsg);
            
            await new Promise(resolve => setTimeout(resolve, 5e3));

            perfMsg = await this.getPerfMessage();
        }

        await this.refreshDetails();

        // Apple's tokens expire without warning and the server cannot renew
        // them, so each launch hands over the current one. Not awaited: nothing
        // on screen waits for it
        if (this.isLoggedIn) {
            refreshAppleMusicLink(this.getAuthHeaders(), this.id)
                .catch(ex => console.warn("Could not refresh the Apple Music link:", ex));
        }

        this.emit("user-init");
    }

    public getAuthHeaders() {
        const headers: {[key: string]: string} = {
            // Every authenticated request carries it, so the server learns what
            // this account is running without the app having to announce it.
            // See APP_CLIENT_VERSION — it is what lets a field be retired on
            // evidence rather than on a guess.
            "x-tempo-client": String(APP_CLIENT_VERSION),
        };

        if (this.storedToken)
            headers["x-api-token"] = this.storedToken;

        return headers;
    }

    /**
     * Mark a For You alert read, so it stops being offered.
     *
     * Waited out rather than reloaded at, and answered: an alert shown again
     * because this never landed is the small version of what the recap drawer
     * made a large one.
     */
    public async markFYPAlertViewed(alertId: string) {
        const req = await fetchThroughRateLimit(API_URL + `/me/feed/alert/viewed/${alertId}`, {
            method: "POST",
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });

        return req.status == 200;
    }

    /**
     * Sign out: here for certain, and on the server if it will hear it.
     *
     * The session is the server's to end, but the account on this device is
     * ours, and somebody who has asked to sign out should not be left signed in
     * because the request was refused. That is what a rate limit used to do -
     * the reload left the token in storage, and the app came back up signed in
     * as though nothing had been asked - so the local sign-out now happens
     * either way, and the answer says whether the server agreed.
     */
    public async logout() {
        let confirmed = false;

        // First, and on its own: whoever signs in next is not necessarily
        // whoever linked Apple Music here, and nothing below may stop this
        try {
            forgetAppleMusicHere();
        } catch (ex) {
            console.warn("Could not forget Apple Music on this device:", ex);
        }

        try {
            const req = await fetchThroughRateLimit(API_URL + "/logout", {
                method: "POST",
                headers: {
                    ...(this.getAuthHeaders())
                },
                credentials: "include",
            });

            confirmed = req.status == 200;

            if (!confirmed)
                console.warn("The server did not confirm the sign-out, code:", req.status, "- signing out on this device anyway");
        } catch (ex) {
            /*
             * The request could not be sent at all - no network, most likely.
             *
             * Caught rather than thrown on, because everything below it is the
             * part of signing out that is ours to do, and somebody left signed
             * in because their train went into a tunnel is the exact outcome
             * this method exists to prevent.
             */
            console.warn("The sign-out request could not be sent, error:", ex, "- signing out on this device anyway");
        }

        this.isLoggedIn = false;
        this.object = undefined;
        this.storedToken = undefined;
        this.id = "";
        this.email = "";
        this.friends = [];
        this.friendsSessionsCount = 0;
        this.emit("user-logout");

        try {
            window.localStorage.removeItem("tempo.a");
        } catch (ex) {
            console.warn("Could not clear the stored token, error:", ex);
        }

        return confirmed;
    }

    /**
     * Record how somebody feels about a song.
     *
     * A tap that has to land, so a rate limit is waited out rather than
     * reloaded over - the reload took the card, the queue behind it and the
     * verdict with it.
     */
    public async setSongAffinity(songId: string, affinity: number) {
        const req = await fetchThroughRateLimit(API_URL + "/me/taste/affinity", {
            method: "POST",
            headers: {
                ...(this.getAuthHeaders()),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                songId,
                // Clamp the affinity to -5 to 5
                affinity: Math.max(-5, Math.min(5, affinity)),
            }),
            credentials: "include",
        });

        return req.status == 200;
    }

    /* ---------------------------------------------------------- playlists */

    /**
     * One call to the playlist routes, which all answer the same way: a
     * `data` on success, a `message` on failure, and `needsReauth` when the
     * fix is a sign-in rather than a retry.
     */
    private async playlistCall<T>(path: string, init: RequestInit = {}): Promise<T> {
        const url = API_URL + "/me/playlists" + path;
        const req = await fetchThroughRateLimit(url, {
            ...init,
            headers: {
                ...(this.getAuthHeaders()),
                ...(init.body ? { "Content-Type": "application/json" } : {}),
            },
            credentials: "include",
        });

        if (req.status == 429)
            throw new RateLimitedError(url);

        const res = (await req.json().catch(() => ({}))) as {
            error?: boolean;
            message?: string;
            needsReauth?: boolean;
            data?: T;
        };

        if (res.needsReauth)
            throw new PlaylistNeedsSignInError(res.message ?? "Sign in again to send playlists to Spotify.");

        if (!req.ok || res.error || res.data === undefined)
            throw new Error(res.message ?? "Something went wrong with that playlist. Try again in a moment.");

        return res.data;
    }

    public async getPlaylists(): Promise<PlaylistSummary[]> {
        return this.playlistCall<PlaylistSummary[]>("");
    }

    public async getPlaylist(id: string): Promise<Playlist> {
        return this.playlistCall<Playlist>("/" + encodeURIComponent(id));
    }

    /** What a recipe would make right now, without keeping it. */
    public async previewPlaylist(recipe: PlaylistRecipe): Promise<PlaylistSong[]> {
        const preview = await this.playlistCall<{ songs: PlaylistSong[] }>("/preview", {
            method: "POST",
            body: JSON.stringify({ recipe }),
        });

        return preview.songs;
    }

    public async createPlaylist(recipe: PlaylistRecipe, name?: string): Promise<Playlist> {
        return this.playlistCall<Playlist>("", {
            method: "POST",
            body: JSON.stringify({ recipe, name }),
        });
    }

    /** Take a song out. It stays out however many times the playlist is refreshed. */
    public async removeFromPlaylist(id: string, songId: string): Promise<Playlist> {
        return this.playlistCall<Playlist>("/" + encodeURIComponent(id), {
            method: "PATCH",
            body: JSON.stringify({ remove: songId }),
        });
    }

    public async refreshPlaylist(id: string): Promise<Playlist> {
        return this.playlistCall<Playlist>("/" + encodeURIComponent(id) + "/refresh", { method: "POST" });
    }

    /** Write it to Spotify, or bring Spotify's copy up to date. Throws PlaylistNeedsSignInError when the account cannot yet. */
    public async sendPlaylistToSpotify(id: string): Promise<Playlist> {
        return this.playlistCall<Playlist>("/" + encodeURIComponent(id) + "/spotify", { method: "POST" });
    }

    public async deletePlaylist(id: string): Promise<void> {
        await this.playlistCall<{ deleted: string }>("/" + encodeURIComponent(id), { method: "DELETE" });
    }
    
    public async getRemoteUserPastWeekStats(userId: string, forceRefresh?: boolean) {
        const KEY = `tempo-rusr-past-week-stats-${userId}`;

        const cached: {
            totalListeningDuration: number;
            uniqueSongsPlayedCount: number;
            longestStreak: number;
        } | null = (forceRefresh ? null : getCachedObject(KEY, PROFILE_STATS_CACHE_MS));

        if (cached)
            return cached;

        const url = API_URL + `/profile/${userId}/pastWeekStats`;

        const req = await fetchThroughRateLimit(url, {
            method: "GET",
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });

        /*
         * Raised rather than read as an empty week. Every caller of this logs
         * the failure and leaves the figures as they were, which is the right
         * thing for a profile to do - where a reload was not, since it took the
         * whole page to spare one panel.
         */
        if (req.status == 429)
            throw new RateLimitedError(url);

        const res = await req.json() as {
            error: boolean;
            message?: string;
            data: {
                totalListeningDuration: number;     // in ms
                uniqueSongsPlayedCount: number;
                longestStreak: number;              // in ms
            };
        }

        if (res.error || !res.data)
            throw new Error("Failed to fetch past week stats for user: " + userId + ", error: " + (res.message ?? "unknown error (check network logs)"));

        setCachedObject(KEY, res.data);

        return res.data;
    }

    public async getRemoteUserTopSongs(userId: string, period: "day" | "week" | "month" | "year" | "all", forceRefresh?: boolean) {
        const KEY = `tempo-rusr-top-songs-${period}-${userId}`;

        const cached = getCachedObject<{
            id: string;
            title: string;
            artists: string[];
            index: number;
            explicit: boolean;
            playCount: number;
            imageUrl: string;
        }[]>(KEY, PROFILE_STATS_CACHE_MS);

        if (cached && !forceRefresh)
            return cached;

        const url = API_URL + `/profile/${userId}/topSongs/${period}`;

        const req = await fetchThroughRateLimit(url, {
            method: "GET",
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });

        // The panel keeps the songs it has; see getRemoteUserPastWeekStats.
        if (req.status == 429)
            throw new RateLimitedError(url);

        const res = await req.json() as {
            error: boolean;
            message?: string;
            data: {
                id: string;
                title: string;
                artists: string[];
                index: number;
                explicit: boolean;
                playCount: number;
                imageUrl: string;
            }[];
        };

        if (res.error || !res.data)
            throw new Error("Failed to fetch top songs for user: " + userId + ", error: " + (res.message ?? "unknown error (check network logs)"));

        setCachedObject(KEY, res.data);

        return res.data;
    }

    public async getRemoteUser(userId: string) {
        const KEY = `tempo-rusr-${userId}`;

        const cached = getCachedObject<ClientUserAccount>(KEY, 3600e3 * 48);

        if (cached)
            return cached;

        const url = API_URL + `/profile/${userId}`;

        const req = await fetchThroughRateLimit(url, {
            method: "GET",
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });

        /*
         * Raised, so the one caller that fetches these in a loop - the friends
         * list behind getDetails - can leave out whoever it could not read and
         * keep the rest, which is what it already does with any other failure.
         */
        if (req.status == 429)
            throw new RateLimitedError(url);

        const res = await req.json() as {
            error: boolean;
            message?: string;
            data: {
                me: ClientUserAccount
            };
        };

        if (res.error || !res.data.me)
            throw new Error("Failed to fetch top songs for user: " + userId + ", error: " + (res.message ?? "unknown error (check network logs)"));

        setCachedObject(KEY, res.data.me);

        return res.data.me;
    }

    /**
     * Validator for the cached friends list.
     *
     * Cheap enough to call on every load: it returns a single hash covering each
     * friendship's id and state, so the client can keep its cache without
     * refetching the list and the per-friend profile lookups behind it.
     */
    public async getFriendsListHash(): Promise<string | null> {
        try {
            const req = await fetch(API_URL + "/me/friends/hash", {
                headers: {
                    ...(this.getAuthHeaders())
                },
                credentials: "include",
            });

            if (!req.ok)
                return null;

            const res = await req.json() as { error: boolean; hash?: string };

            return (res.error || !res.hash) ? null : res.hash;
        } catch {
            // Offline or unreachable — the caller falls back to whatever it has
            return null;
        }
    }

    /** Number of friend requests waiting on this user. */
    public async getIncomingRequestCount(): Promise<number> {
        try {
            // Deliberately uncached: getFriends skips its cache for incoming and
            // request states, since a stale count is worse than none
            return (await this.getFriends(["incoming"])).length;
        } catch (ex) {
            console.warn("Failed to load incoming friend requests, error:", ex);

            return 0;
        }
    }

    public async getFriends(filter?: ("friends" | "incoming" | "request" | "blocked")[]) {
        const KEY = `${ME_FRIENDS_CACHE_KEY}${filter ? "-" + filter.sort().join("-") : ""}`;

        // Only use cache if no filter was specified or filter does not include incoming or request types
        const useCache = (!filter || !["incoming", "request"].some((v: any) => filter.includes(v)));

        let cached: { hash: string; data: UserFriendship[] } | null = null;

        if (useCache) {
            cached = getCachedObject<{ hash: string; data: UserFriendship[] }>(KEY, 3600e3);

            if (cached?.data) {
                const currentHash = await this.getFriendsListHash();

                // Serve the cache only when the server agrees it is still current.
                // A time-based cache alone meant a newly added friend — or a
                // request being accepted, which keeps the same friendship id —
                // stayed invisible until the entry expired.
                if (currentHash && currentHash === cached.hash)
                    return cached.data;

                // Hash unavailable (offline): stale data beats no data
                if (!currentHash)
                    return cached.data;
            }
        }

        const url = API_URL + "/me/friends" + (filter ? `?state=${filter.join(",")}` : "");

        const req = await fetchThroughRateLimit(url, {
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });

        /*
         * Raised rather than answered with an empty list, which would read as
         * having no friends at all - and would be written into the cache above
         * as though it were true.
         */
        if (req.status == 429)
            throw new RateLimitedError(url);

        const res = await req.json() as {
            error: boolean;
            message?: string;
            data: UserFriendship[];
            hash?: string;
        };

        if (res.error || !res.data)
            throw new Error("Failed to fetch friends, error: " + (res.message ?? "unknown error (check network logs)"));

        // Stored with the validator the server returned alongside it, so the
        // next load can check it rather than trusting elapsed time
        if (useCache && res.hash)
            setCachedObject(KEY, { hash: res.hash, data: res.data });

        return res.data;
    }

    /*
    This function is used to send a friend request to a user
    @param userId The id of the user to send a friend request to
    @returns A promise that resolves when the friend request is sent
    @throws An error if the friend request fails
    */
    public async sendFriendRequest(userId: string) {
        // Waited out rather than reloaded over: the reload took the reader off
        // the person they had just found, with no way to tell whether the
        // request had been sent.
        const req = await fetchThroughRateLimit(API_URL + "/me/friends/request", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(this.getAuthHeaders())
            },
            body: JSON.stringify({
                targetUserId: userId,
            }),
            credentials: "include",
        });

        if (req.status === 429)
            throw new Error("Failed to send friend request, Tempo is busy - try again in a moment");

        if (req.status === 409)
            throw new Error("Failed to send friend request, user already a friend");

        if (req.status === 400)
            throw new Error("Failed to send friend request, invalid user id");

        if (req.status === 403)
            throw new Error("Failed to send friend request, not authorized");

        if (req.status === 500)
            throw new Error("Failed to send friend request, server error");

        if (req.status !== 200)
            throw new Error("Failed to send friend request, status code: " + req.status);

        const res = await req.json() as {
            error: boolean;
            message?: string;
        };

        if (res.error)
            throw new Error("Failed to send friend request, error: " + (res.message ?? "unknown error (check network logs)"));
    }

    public async acceptFriendRequest(friendshipId: string) {
        const req = await fetchThroughRateLimit(API_URL + "/me/friends/accept/" + friendshipId, {
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });

        // Said plainly, so the page can offer the tap again. A reload here left
        // the request sitting there as though it had been ignored.
        if (req.status == 429)
            throw new Error("Failed to accept friend request, Tempo is busy - try again in a moment");

        const res = await req.json() as {
            error: boolean;
            message?: string;
        };

        if (res.error)
            throw new Error("Failed to accept friend request, error: " + (res.message ?? "unknown error (check network logs)"));

        return;
    }

    /**
     * People you are not friends with, who your friends are friends with.
     *
     * Needs no query — this is what the add-friends page can show somebody
     * before they have typed anything, and it is ordered by how many friends
     * you already have in common.
     */
    public async getFriendSuggestions(limit = 20) {
        const req = await fetchThroughRateLimit(API_URL + `/users/suggestions?limit=${limit}`, {
            headers: { ...(this.getAuthHeaders()) },
            credentials: "include",
        });

        // Nobody to suggest this time, which the page already draws as a page
        // with no suggestions on it rather than as a fault.
        if (!req.ok)
            return [];

        const res = await req.json() as {
            error: boolean;
            data: {
                user: ClientUserAccount;
                mutualFriends: UserFriendship[];
                friendState: UserFriendship["state"] | "incoming" | "none";
            }[];
        };

        return (res.error ? [] : res.data);
    }

    public async searchUsers(query: string, limit?: number) {
        // Waited out: a reload here threw away a half-typed name, and the
        // typing that earned the rate limit is exactly what it discarded.
        const req = await fetchThroughRateLimit(API_URL + "/users/query", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(this.getAuthHeaders())
            },
            body: JSON.stringify({
                query: query.toLowerCase(),
                limit,
            }),
            credentials: "include",
        });

        if (req.status == 429)
            throw new Error("Failed to search, Tempo is busy - try again in a moment");

        const res = await req.json() as {
            error: boolean;
            data: {
                user: ClientUserAccount;
                mutualFriends: UserFriendship[];
                friendState: UserFriendship["state"] | "incoming" | "none";
                friendshipId?: string;
            }[];
        };

        if (res.error)
            throw new Error("Failed to fetch query response, raw response: " + JSON.stringify(res));

        return res.data;
    }

    public async getPerfMessage() {
        try {
            const req = await fetch(API_URL + "/perf", {
                headers: {
                    ...(this.getAuthHeaders())
                }
            });

            /*
             * No notice this time, and no waiting for one either: this runs
             * before anything else on boot and again every five seconds while a
             * notice is up, so the next ask is never far off - and a reload
             * over it meant an app that could not finish starting.
             */
            if (req.status == 429)
                return undefined;

            const res = await req.json() as {
                active: boolean;
                message: string;
            };

            if (!res.active)
                return undefined;
            else
                return res.message;
        } catch (ex) {
            console.error("Failed to get perf msg, error:", (ex as unknown as Error).toString());

            return undefined;
        }
    }

    public async refreshDetails() {
        // Check if we are successfully authenticated
        const loggedIn = await this.isUserAuthenticated();
        
        // If we are logged in, load the user details
        if (loggedIn) {
            const details = await this.getDetails();

            /*
             * Signed in as far as /chkauth is concerned, but there is no account
             * to load.
             *
             * getDetails resolves undefined whenever /me answers with an error,
             * and the assignments below then read .id off it and throw - inside
             * the promise the app awaits before it can render anything. The
             * result was a loading screen that never moved, with the real cause
             * a TypeError in the console rather than anything about signing in.
             *
             * The two answers can disagree legitimately: an account whose
             * sign-in never completed has no session, so /me has nothing to
             * return. Treating that as not-signed-in gets the person to the
             * sign-in prompt, which is the one thing that can actually fix it.
             */
            if (!details) {
                console.warn("Authenticated but no account could be loaded - treating as signed out so sign-in can be offered");

                this.object = undefined;
                this.isLoggedIn = false;

                return;
            }
            
            const friendsSessions = (await new DataStreamer(this.storedToken).fetchFriendsStreams(true)).filter(v => v !== details?.id);

            this.friendsSessionsCount = friendsSessions.length;

            await this.loadSettings();

            // Expose the raw user object
            this.object = details;

            this.id = details.id;
            this.email = details.email;

            // Remember who signs in here, so the next sign-in on this device
            // can be routed to this account's own Spotify app - see
            // KNOWN_USER_KEY. Written on every load rather than once, so a
            // device that changes hands between accounts follows the account.
            try {
                window.localStorage.setItem(KNOWN_USER_KEY, details.id);
            } catch { }
            
            if (!this.isLoggedIn)
                this.isLoggedIn = true;
        } else {
            // If we are not logged in, set the user object to undefined
            this.object = undefined;
            this.isLoggedIn = false;
        }
    }

    /**
     * A page of the feed.
     *
     * Raised rather than answered with an empty page, whatever went wrong.
     * Discover reads an empty page as the end of the feed and stops asking for
     * more until it is rebuilt, so a page that merely failed to arrive must not
     * look like one - a rate limit, or a train going into a tunnel, would have
     * ended somebody's Discover for the rest of the sitting. It used to answer
     * every failure that way. Discover logs what it catches and comes back for
     * the page when the reader next runs low, which is the behaviour a
     * temporary failure should get.
     */
    public async getMyFYP(page: number, pagePreset?: "activity" | "discover") {
        if (page < 1)
            page = 1;

        const url = API_URL + "/me/feed/" + page + (pagePreset ? "?p=" + pagePreset : "");

        const req = await fetchThroughRateLimit(url, {
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include"
        });

        if (req.status == 429)
            throw new RateLimitedError(url);

        const res = (await req.json()) as {
            error: boolean;
            message?: string;
            data: FeedItem[];
        };

        if (res.error || !res.data)
            throw new Error("Failed to fetch the feed, error: " + (res.message ?? "unknown error (check network logs)"));

        return res.data;
    }

    /**
     * What friends who are not playing anything right now were listening to.
     *
     * Cached briefly. The section sits under the live one and is refreshed when
     * playback changes anyway, so asking on every render would spend a request
     * to learn that somebody who stopped an hour ago has still stopped.
     */
    public async getFriendsRecentActivity(forceRefresh?: boolean): Promise<FriendRecentActivity[]> {
        const KEY = "tempo-friends-recent-activity";

        const cached = getCachedObject<FriendRecentActivity[]>(KEY, 120e3);

        if (cached && !forceRefresh)
            return cached;

        try {
            const req = await fetch(API_URL + "/spotify/friends/recent-activity", {
                headers: { ...(this.getAuthHeaders()) },
                credentials: "include",
            });

            if (!req.ok)
                throw new Error("Request failed with status " + req.status.toString());

            const res = (await req.json()) as {
                error: boolean;
                message?: string;
                data: FriendRecentActivity[];
            };

            if (res.error || !res.data)
                throw new Error(res.message ?? "no data returned");

            setCachedObject(KEY, res.data);

            return res.data;
        } catch (ex) {
            // A section that cannot load is left out rather than shown broken -
            // the friends above it are the part of this page that matters
            console.warn("Failed to load recent friend activity:", ex);

            return cached ?? [];
        }
    }

    public async getFriendProfileListenershipHistory(userId: string, page: number, forceRefresh?: boolean) {
        if (page < 0)
            page = 0;

        const KEY = `tempo-rusr-history-${userId}-${page.toString()}`;

        // 5 min cache
        const cached = getCachedObject<{
            isFinalPage: boolean;
            data: FriendListenershipItem[];
        }>(KEY, 300e3);

        if (cached && !forceRefresh)
            return cached;

        const url = API_URL + `/profile/${userId}/history/${page}`;

        const req = await fetchThroughRateLimit(url, {
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include"
        });

        /*
         * Raised rather than read as the end of somebody's history: this is
         * paged, an empty page is how the list learns it has reached the
         * bottom, and it would be cached as the bottom too.
         */
        if (req.status == 429)
            throw new RateLimitedError(url);

        const res = (await req.json()) as {
            error: boolean;
            message?: string;
            data: FriendListenershipItem[];
            isFinalPage: boolean;
        };

        if (res.error)
            throw new Error("Failed to fetch friend profile listenership history, error: " + (res.message ?? "unknown error (check network logs)"));

        if (!res.data)
            throw new Error("Failed to fetch friend profile listenership history, empty data set");

        const data = {
            isFinalPage: res.isFinalPage,
            data: res.data
        };

        setCachedObject(KEY, data);

        return data;
    }

    public async loadSettings() {
        const req = await fetchThroughRateLimit(API_URL + "/me/settings", {
            headers: {
                ...(this.getAuthHeaders()),
            },
            credentials: "include",
        });

        /*
         * Whatever is already held, rather than a throw or a reload.
         *
         * Sign-in awaits this, so anything that comes out of here sideways
         * stops the app on its loading screen - and a rate limit is likeliest
         * on exactly that first burst of requests. Leaving the settings as they
         * are means the defaults on a cold start, and the reader's own the
         * moment this is asked again.
         */
        if (req.status == 429) {
            console.warn("Could not load settings just now - Tempo is rate limiting; keeping what is held");

            return this.settings;
        }

        const data = await req.json() as {
            error: boolean;
            data: UserSettings;
        };

        this.settings = data.data;

        return data.data;
    }

    /**
     * Change one setting, and say whether it took.
     *
     * A rate limit is waited out: this is a switch somebody has just flicked,
     * and a reload would have put it back where it was without saying so.
     */
    public async updateSetting(key: string, value: any) {
        const req = await fetchThroughRateLimit(API_URL + "/me/settings", {
            method: "POST",
            headers: {
                ...(this.getAuthHeaders()),
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                key,
                value,
            }),
        });

        return (req.status == 200);
    }

    /**
     * Whether the server still knows this session.
     *
     * A rate limit is not an answer to that question, and it must not be read
     * as "no": the caller signs the reader out on a false, and the old reload
     * here returned undefined - falsy - on its way to asking again.
     *
     * Waiting out the limit answers it properly nearly always. When it does
     * not, the question is passed on rather than guessed at: this endpoint is
     * only a cheap pre-check, /me is the authority, and the caller already
     * handles /me having no account to give by offering sign-in. Answering
     * from what we happened to believe would not do - on a cold start that is
     * false for everybody, signed in or not, so a busy minute at launch would
     * put a perfectly good session at the sign-in prompt without so much as
     * asking /me.
     */
    private async isUserAuthenticated() {
        const req = await fetchThroughRateLimit(API_URL + "/chkauth", {
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include"
        });

        if (req.status == 429) {
            console.warn("Could not check the session - Tempo is rate limiting; leaving it to /me");

            this.sessionUnconfirmed = true;

            return true;
        }

        this.sessionUnconfirmed = false;

        return (req.status == 200);
    }

    async getDetails(): Promise<undefined | ClientUserAccount> {
        return new Promise<undefined | ClientUserAccount>(async resolve => {
            try {
                /**
                 * Takes the id explicitly rather than reading this.id, which is
                 * only assigned by refreshDetails *after* getDetails resolves.
                 * Both call sites below therefore ran with an empty id on first
                 * load, so friends were never fetched and "friends-updated"
                 * never fired — leaving the friends page on its spinner forever.
                 */
                const loadFriends = async (userId?: string) => {
                    const id = userId || this.id;

                    if (id === "")
                        return;

                    let friends: UserFriendship[];

                    /*
                     * A friends list that could not be read is not a missing
                     * account. Anything thrown in here lands in the catch at
                     * the foot of this promise, which reads every failure as
                     * "not authenticated" and hands back no account at all - so
                     * one busy minute on this one request would put somebody
                     * who is perfectly well signed in at the sign-in prompt.
                     */
                    try {
                        friends = await this.getFriends(["friends"]);
                    } catch (ex) {
                        console.warn("Could not load the friends list with the account, error:", ex);

                        return;
                    }

                    const frtemp: typeof this.friends = [];

                    for (let i = 0; i < friends.length; i++) {
                        const f = friends[i];
                        const otherId = (f.u1Id == id ? f.u2Id : f.u1Id);

                        try {
                            const user = await this.getRemoteUser(otherId);

                            const uniqueUserIds = new Set();

                            if (!uniqueUserIds.has(user.id)) {
                                frtemp.push({
                                    user: user,
                                    friendship: f,
                                });
                                uniqueUserIds.add(user.id);
                            }
                        } catch (ex) {
                            console.warn("Unable to fetch user object for", otherId);
                        }
                    }

                    this.friends = frtemp;

                    this.emit("friends-updated", this.friends);
                };

                // 2 day cache duration
                const cachedData = getCachedObject<ClientUserAccount>(ME_CACHE_KEY, 3600e3 * 48);

                /*
                 * Resolved early where there is a copy, so the interface has
                 * something to draw while the account is refreshed behind it -
                 * but only once something has confirmed the session. With
                 * /chkauth unanswered, /me is the only thing that can, and
                 * until it does a two-day-old account is not evidence of one.
                 */
                const servedFromCache = !!cachedData && !this.sessionUnconfirmed;

                if (servedFromCache)
                    resolve(cachedData);

                const req = await fetchThroughRateLimit(API_URL + "/me", {
                    headers: {
                        ...(this.getAuthHeaders())
                    },
                    credentials: "include"
                });

                /*
                 * The cached account stands, and where there is none the caller
                 * is told there is none - refreshDetails reads that as "signed
                 * in, nothing to load" and offers sign-in, which is at least a
                 * screen with a way forward on it.
                 *
                 * The reload this replaces was worse than it looks: it sat
                 * inside a promise the whole app awaits before it can render,
                 * and returning from here resolved nothing at all. Only the
                 * reload itself ended the wait.
                 */
                if (req.status == 429) {
                    console.warn("Could not load the account - Tempo is rate limiting");

                    if (servedFromCache) {
                        /*
                         * The cached account is already out, so its friends
                         * belong with it: that list has a cache and a failure
                         * path of its own, and the friends page waits on the
                         * event it fires rather than on this promise.
                         */
                        await loadFriends(cachedData?.id);

                        return;
                    }

                    /*
                     * Neither endpoint could answer, so nothing has confirmed
                     * this session. The caller reads no account as "offer
                     * sign-in", which is the honest thing to show somebody
                     * whose session we cannot vouch for - rather than the
                     * signed-in interface, drawn from a two-day-old copy, on
                     * which nothing they touch will work.
                     */
                    return resolve(undefined);
                }

                await loadFriends(cachedData?.id);

                if (cachedData)
                    return;

                const res = await req.json() as {
                    error: boolean;
                    data?: ClientUserAccount;
                    message?: string;
                }

                if (res.error) {
                    // The server has stated that there was an error
                    console.warn("Server responded with an error state while fetching user authentication status, error:", res.message ?? "Unspecified server error");

                    return resolve(undefined);
                }

                await loadFriends(res.data?.id);

                if (res.data)
                    setCachedObject(ME_CACHE_KEY, res.data);

                return resolve(res.data);
            } catch (ex) {
                console.error("Failed to get user details, error:", ex, "\nWe will assume the user is not authenticated");

                this.authError = true;

                return resolve(undefined);
            }
        });
    }

    public async getRecaps(showAlreadySeen?: boolean) {
        const req = await fetchThroughRateLimit(API_URL + "/me/recap" + (showAlreadySeen ? "?seen=true" : ""), {
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });

        /*
         * A rate-limited poll was the worst place in the app to reload, which
         * is what every request in here used to do: the reload lands on a recap
         * the server still calls unseen, which opens the drawer over the whole
         * screen, and the only way out of it sends a request of its own -
         * rate-limited too, so another reload. Nothing is lost by reading it as
         * "no recaps this time"; the poll is back in thirty seconds.
         */
        if (req.status == 429)
            return {
                daily: null,
                weekly: null,
            };

        /*
         * No recap is not a failure, however the server says it. It answers an
         * empty day with two nulls now, and used to answer 404 with
         * error: true - which a client that throws turns into an error logged
         * every thirty seconds for everybody who simply has nothing to see.
         * Read here as well as fixed there, since an app build and the server
         * it talks to do not ship together.
         */
        if (req.status == 404)
            return {
                daily: null,
                weekly: null,
            };

        const res = (await req.json()) as {
            error: boolean;
            message?: string;
            data?: {
                daily: Recap | null;
                weekly: Recap | null;
            };
        };

        if (res.error)
            throw new Error("Server returned an error response while fetching recaps, code: " + req.status.toString() + " (" + (res.message ?? "unknown error") + ")")

        // Assume empty since server technically didnt return an error
        if (!res.data) return {
            daily: null,
            weekly: null,
        };

        // alert(res.data.daily?.id ?? res.data.weekly?.id);

        return res.data;
    }

    /**
     * Tell the server a recap has been seen, so it stops being offered.
     *
     * Retried, and worth awaiting: this is the only thing that stops a recap
     * coming back, and it used to be one unchecked POST whose failure - an
     * expired token, a rate limit, a 502 from a restarting server - left the
     * drawer reopening every thirty seconds and on every launch, with its close
     * button the only way out and no more luck than the first time.
     *
     * Returns whether the server confirmed it, so a caller can tell a recap
     * that is put away everywhere from one put away only on this device.
     */
    public async markRecapSeen(type: "daily" | "weekly", attempts: number = 3) {
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                const req = await fetch(API_URL + "/me/recap/" + type + "/seen", {
                    method: "POST",
                    headers: {
                        ...(this.getAuthHeaders())
                    },
                    credentials: "include",
                });

                if (req.status == 200)
                    return true;

                /*
                 * A 4xx that is not a rate limit is settled: the token is not
                 * accepted, or the type is not one the server knows. The same
                 * request cannot get a different answer, so stop asking.
                 */
                if (req.status < 500 && req.status != 429) {
                    console.warn("Server refused to mark the", type, "recap seen, code:", req.status);

                    return false;
                }

                console.warn("Failed to mark the", type, "recap seen, code:", req.status, "try:", attempt, "of", attempts);

                if (attempt < attempts)
                    await new Promise(resolve => setTimeout(resolve, rateLimitPauseMs(req, attempt)));
            } catch (ex) {
                console.warn("Failed to mark the", type, "recap seen, try:", attempt, "of", attempts, "error:", ex);

                if (attempt < attempts)
                    await new Promise(resolve => setTimeout(resolve, backoffPauseMs(attempt)));
            }
        }

        return false;
    }

    public async getEncryptionAvailability(): Promise<EncryptionAvailability> {
        const req = await fetch("/api/me/encryption-availability");

        const res = await req.json() as {
            error: boolean;
            message?: string;
            data?: EncryptionAvailability;
        };

        if (res.error) {
            console.warn("Server responded with an error state while fetching encryption availability, error:", res.message ?? "Unspecified server error");

            return {
                configured: false,
                keyId: "",
            };
        }

        if (!res.data) {
            console.warn("Server responded with an empty data set while fetching encryption availability");

            return {
                configured: false,
                keyId: "",
            };
        }

        return res.data;
    }
}
