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

export type EncryptionAvailability = {
    configured: boolean;
    keyId: string;
}

export default class User extends EventEmitter {
    public isLoggedIn: boolean = false;
    public id: string = "";
    public email: string = "";
    public object: ClientUserAccount | undefined;

    constructor() {
        super();

        const storedToken = window.localStorage.getItem("tempo.a");

        if (storedToken)
            document.cookie = "tempo.a=" + storedToken;
    }

    async init(): Promise<void> {
        await this.refreshDetails();
        this.emit("user-init");
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

    private async isUserAuthenticated() {
        const d = await this.getDetails();

        return (d !== undefined);
    }

    async getDetails(): Promise<undefined | ClientUserAccount> {
        try {
            const req = await fetch(API_URL + "/me", {
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
