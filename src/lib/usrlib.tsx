import EventEmitter from "events";
import { API_URL } from "./const";

// export type PublicUserAccount = {
//     id: string;
//     firstName: string;
//     lastName: string;
//     profession: string;
//     registeredAt: number;
//     gravatarHash: string;
//     encryption: {
//         configured: boolean;
//         keyId: string;
//         publicKey: string; // May need to create a type for this
//         primaryKey: string;
//     };
//     lastSeenString: "now" | string;
// }

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

export interface songData {
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
        track: songData;
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

    constructor() {
        super();

        const storedToken = window.localStorage.getItem("tempo.a");

        if (storedToken)
            this.storedToken = storedToken;
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

    public async getRemoteUserTopSongs(userId: string, period: "day" | "week" | "month" | "year" | "all") {
        const req = await fetch(API_URL + `/profile/${userId}/topSongs/${period}`, {
            method: "GET",
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });
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

    public async searchUsers(query: string) {
        const req = await fetch(API_URL + "/searchUsers", {
            method: "POST",
            headers: {
                ...(this.getAuthHeaders())
            },
            body: JSON.stringify({
                query,
            }),
        });
        const res = await req.json() as {
            error: boolean;
            message?: string;
            results: ClientUserAccount[];
        };

        if (res.error)
            throw new Error("Failed to fetch query response, raw response: " + JSON.stringify(res));

        return res.results;
    }

    public async getPerfMessage() {
        try {
            const req = await fetch(API_URL + "/perf", {
                headers: {
                    ...(this.getAuthHeaders())
                }
            });
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
        this.isLoggedIn = await this.isUserAuthenticated();
        
        // If we are logged in, load the user details
        if (this.isLoggedIn) {
            const details = await this.getDetails();

            // Expose the raw user object
            this.object = details;

            this.id = details!.id;
            this.email = details!.email;
        }
    }

    public async getFriendsListenershipHistory(page: number) {
        try {
            const req = await fetch(API_URL + "/me/feed/history/" + page, {
                headers: {
                    ...(this.getAuthHeaders())
                },
                credentials: "include"
            });
            const res = (await req.json()) as {
                error: boolean;
                message?: string;
                data: FriendListenershipItem[];
                isFinalPage: boolean;
            };

            if (res.error) {
                console.warn("Failed to load friends listenership data, res:", res);

                return {
                    d: [],
                    l: false,
                    e: true,
                };
            }

            return {
                d: res.data,
                l: res.isFinalPage,
                e: false,
            };
        } catch (ex) {
            console.error("getFriendsListenershipHistory failed with error:", ex);

            return {
                d: [],
                l: false,
                e: true,
            };
        }
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

            return res.data;
        } catch (ex) {
            console.error("Failed to check user authentication status, error:", ex, "\nWe will assume the user is not authenticated");

            this.authError = true;

            return undefined;
        }
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
