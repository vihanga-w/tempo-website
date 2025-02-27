import EventEmitter from "events";
import { TokenStorage } from "./tokens";

export type PublicUserAccount = {
    id: string;
    firstName: string;
    lastName: string;
    profession: string;
    registeredAt: number;
    gravatarHash: string;
    encryption: {
        configured: boolean;
        keyId: string;
        publicKey: string; // May need to create a type for this
        primaryKey: string;
    };
    lastSeenString: "now" | string;
}

// The client-safe user account object
export type ClientUserAccount = {
    id: string;
    user: {
        phoneNumber: string;
        firstName: string;
        lastName: string;
        fullName: string;
        email: string;
        profession: string;
    },
    settings: { },
    entropy: string;
    registeredAt: number;
    encryption: {
        configured: boolean;
        keyId: string;
        publicKey: string; // May need to create a type for this
        primaryKey: string;
    };
    inviteCode: string;
    inviteCodeExpiry: number;
    circle: PublicUserAccount[];
}

export type EncryptionAvailability = {
    configured: boolean;
    keyId: string;
}

export default class User extends EventEmitter {
    private token: TokenStorage;
    public isLoggedIn: boolean = false;
    public id: string = "";
    public firstName: string = "";
    public lastName: string = "";
    public fullName: string = "";
    public email: string = "";
    public entropy: string = "";
    public registeredAt: Date = new Date(0);
    public phoneNumber: string = "";
    public object: ClientUserAccount | undefined;
    public profession: string = "";
    public inviteCode: string = "";
    public inviteCodeExpiry: number = -1;
    public circle: PublicUserAccount[] = [];
    public encryption: ClientUserAccount["encryption"] | undefined;

    constructor() {
        super();

        // Setup the token store
        this.token = new TokenStorage(window.localStorage);
    }

    public getToken(): string {
        return this.token.getToken();
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
            this.firstName = details!.user.firstName;
            this.lastName = details!.user.lastName;
            this.fullName = (this.firstName !== "" && this.lastName !== "" ? (
                this.firstName + " " + this.lastName // Both first name and last name are available
            ) : (
                this.firstName !== "" ? this.firstName : this.lastName // Only the first name or the last name is available
            ));
            this.email = details!.user.email;
            this.phoneNumber = details!.user.phoneNumber;
            this.entropy = details!.entropy;
            this.registeredAt = new Date(details!.registeredAt);
            this.profession = details!.user.profession;
            this.inviteCode = details!.inviteCode;
            this.inviteCodeExpiry = details!.inviteCodeExpiry;
            this.circle = details!.circle;
            this.encryption = details!.encryption;
        }
    }

    private async isUserAuthenticated() {
        const d = await this.getDetails();

        return (d !== undefined);
    }

    async getDetails(): Promise<undefined | ClientUserAccount> {
        try {
            const req = await fetch("/api/me");
            const res = await req.json() as {
                error: boolean;
                message?: string;
                data?: ClientUserAccount;
            };

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
