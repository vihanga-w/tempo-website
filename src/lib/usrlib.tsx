import EventEmitter from "events";
import {
    API_URL, ME_CACHE_KEY, ME_FRIENDS_CACHE_KEY, PROFILE_STATS_CACHE_MS, KNOWN_USER_KEY,
    APP_CLIENT_VERSION,
} from "./const";
import { Recap } from "@/components/recap-drawer";
import { FaF } from "react-icons/fa6";
import { DataStreamer } from "./live-ingest";
import { Song } from "@/components/music-discovery-feed";
import { getCachedObject, setCachedObject } from "./client-cache";

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

    public async markFYPAlertViewed(alertId: string) {
        const req = await fetch(API_URL + `/me/feed/alert/viewed/${alertId}`, {
            method: "POST",
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });
        
        if (req.status == 429)
            window.location.reload();
    }

    public async logout() {
        const req = await fetch(API_URL + "/logout", {
            method: "POST",
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });

        if (req.status == 429)
            window.location.reload();

        if (req.status == 200) {
            this.isLoggedIn = false;
            this.object = undefined;
            this.storedToken = undefined;
            this.id = "";
            this.email = "";
            this.friends = [];
            this.friendsSessionsCount = 0;
            this.emit("user-logout");
            window.localStorage.removeItem("tempo.a");
        }
    }

    public async setSongAffinity(songId: string, affinity: number) {
        const req = await fetch(API_URL + "/me/taste/affinity", {
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
        
        if (req.status == 429)
            window.location.reload();

        return req.status == 200;
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

        const req = await fetch(API_URL + `/profile/${userId}/pastWeekStats`, {
            method: "GET",
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });
        
        if (req.status == 429)
            window.location.reload();

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

        const req = await fetch(API_URL + `/profile/${userId}/topSongs/${period}`, {
            method: "GET",
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });
        
        if (req.status == 429)
            window.location.reload();

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

        const req = await fetch(API_URL + `/profile/${userId}`, {
            method: "GET",
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });

        if (req.status == 429)
            window.location.reload();

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

        const req = await fetch(API_URL + "/me/friends" + (filter ? `?state=${filter.join(",")}` : ""), {
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });

        if (req.status == 429)
            window.location.reload();

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
        const req = await fetch(API_URL + "/me/friends/request", {
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

        if (req.status == 429)
            window.location.reload();

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
        const req = await fetch(API_URL + "/me/friends/accept/" + friendshipId, {
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });

        if (req.status == 429)
            window.location.reload();

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
        const req = await fetch(API_URL + `/users/suggestions?limit=${limit}`, {
            headers: { ...(this.getAuthHeaders()) },
            credentials: "include",
        });

        if (req.status === 429)
            window.location.reload();

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
        const req = await fetch(API_URL + "/users/query", {
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
            window.location.reload();

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

            if (req.status == 429)
                window.location.reload();

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

    public async getMyFYP(page: number, pagePreset?: "activity" | "discover") {
        if (page < 1)
            page = 1;

        try {
            const req = await fetch(API_URL + "/me/feed/" + page + (pagePreset ? "?p=" + pagePreset : ""), {
                headers: {
                    ...(this.getAuthHeaders())
                },
                credentials: "include"
            });

            if (req.status == 429)
                window.location.reload();

            const res = (await req.json()) as {
                error: boolean;
                message?: string;
                data: FeedItem[];
            };

            return res.data;
        } catch (ex) {
            console.error("getMyFYP failed with error:", ex);

            return [];
        }
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

        const req = await fetch(API_URL + `/profile/${userId}/history/${page}`, {
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include"
        });

        if (req.status == 429)
            window.location.reload();

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
        const req = await fetch(API_URL + "/me/settings", {
            headers: {
                ...(this.getAuthHeaders()),
            },
            credentials: "include",
        });

        if (req.status == 429)
            window.location.reload();

        const data = await req.json() as {
            error: boolean;
            data: UserSettings;
        };

        this.settings = data.data;

        return data.data;
    }

    public async updateSetting(key: string, value: any) {
        const req = await fetch(API_URL + "/me/settings", {
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

        if (req.status == 429)
            window.location.reload();

        return (req.status == 200);
    }

    private async isUserAuthenticated() {
        const req = await fetch(API_URL + "/chkauth", {
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include"
        });

        if (req.status == 429)
            return window.location.reload();

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

                    if (id !== "") {
                        const friends = await this.getFriends(["friends"]);

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
                    }
                };

                // 2 day cache duration
                const cachedData = getCachedObject<ClientUserAccount>(ME_CACHE_KEY, 3600e3 * 48);

                // Dont return here so we can still do the rate limit check
                if (cachedData)
                    resolve(cachedData);

                const req = await fetch(API_URL + "/me", {
                    headers: {
                        ...(this.getAuthHeaders())
                    },
                    credentials: "include"
                });

                if (req.status == 429)
                    return window.location.reload();

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
        const req = await fetch(API_URL + "/me/recap" + (showAlreadySeen ? "?seen=true" : ""), {
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });
            
        if (req.status == 429)
            window.location.reload();

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

    public async markRecapSeen(type: "daily" | "weekly") {
        const req = await fetch(API_URL + "/me/recap/" + type + "/seen", {
            method: "POST",
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });

        if (req.status == 429)
            window.location.reload();
        
        // This is not a definite indicator of success as the server does not return a success validated state
        return (req.status == 200);
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
