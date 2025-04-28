import EventEmitter from "events";
import { API_URL } from "./const";
import { Recap } from "@/components/recap-drawer";
import { FaF } from "react-icons/fa6";
import { DataStreamer } from "./live-ingest";
import { Song } from "@/components/music-discovery-feed";

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

export interface FriendListenershipItem {
    userId: string;
    username: string;
    pfpUrl: string;
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
        const headers: {[key: string]: string} = {};

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
    
    public async getRemoteUserPastWeekStats(userId: string) {
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

        return res.data;
    }

    public async getRemoteUserTopSongs(userId: string, period: "day" | "week" | "month" | "year" | "all") {
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

        return res.data;
    }

    public async getRemoteUser(userId: string) {
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

        return res.data.me;
    }

    public async getFriends(filter?: ("friends" | "incoming" | "request" | "blocked")[]) {
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
        };

        if (res.error || !res.data)
            throw new Error("Failed to fetch friends, error: " + (res.message ?? "unknown error (check network logs)"));

        // alert(JSON.stringify(res));

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
            
            const friendsSessions = (await new DataStreamer(this.storedToken).fetchFriendsStreams()).filter(v => v !== details?.id);

            this.friendsSessionsCount = friendsSessions.length;

            await this.loadSettings();

            // Expose the raw user object
            this.object = details;

            this.id = details!.id;
            this.email = details!.email;
            
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

    public async getFriendProfileListenershipHistory(userId: string, page: number) {
        if (page < 0)
            page = 0;

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

        return {
            isFinalPage: res.isFinalPage,
            data: res.data
        };
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
        const d = await this.getDetails();

        return (d !== undefined);
    }

    async getDetails(): Promise<undefined | ClientUserAccount> {
        try {
            const req = await fetch(API_URL + "/me", {
                headers: {
                    ...(this.getAuthHeaders())
                },
                credentials: "include"
            });

            if (req.status == 429)
                window.location.reload();

            const res = await req.json() as {
                error: boolean;
                data?: ClientUserAccount;
                message?: string;
            }

            if (res.error) {
                // The server has stated that there was an error
                console.warn("Server responded with an error state while fetching user authentication status, error:", res.message ?? "Unspecified server error");

                return undefined;
            }

            if (this.id !== "") {
                const friends = await this.getFriends(["friends"]);

                const frtemp: typeof this.friends = [];

                for (let i = 0; i < friends.length; i++) {
                    const f = friends[i];
                    const otherId = (f.u1Id == this.id ? f.u2Id : f.u1Id);
                    
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

            return res.data;
        } catch (ex) {
            console.error("Failed to get user details, error:", ex, "\nWe will assume the user is not authenticated");

            this.authError = true;

            return undefined;
        }
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
