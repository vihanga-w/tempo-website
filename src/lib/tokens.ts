import { hash } from "crypto";

export class TokenStorage {
    private localStorage: Storage;

    constructor(localStorage: Storage) {
        this.localStorage = localStorage;

        // Sync token stores
        document.cookie = `a=${this.getToken()};`;
    }

    getMixToken() {
        const hash = this.localStorage.getItem("m-ph") ?? "";

        return hash;
    }

    setMixToken(hash: string) {
        this.localStorage.setItem("m-ph", hash);
    }

    getToken() {
        const token = this.localStorage.getItem("mchat-auth-token") ?? "";

        return token;
    }

    setToken(token: string) {
        this.localStorage.setItem("mchat-auth-token", token);
        document.cookie = `a=${token};`;
    }
}