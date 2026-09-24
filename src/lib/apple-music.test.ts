import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
    platform: "ios",
    authorize: vi.fn(),
    userToken: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
    Capacitor: { getPlatform: () => native.platform },
    registerPlugin: () => ({
        authorize: native.authorize,
        userToken: native.userToken,
        authorizationStatus: vi.fn(),
    }),
}));

// The app keeps the marker in Preferences; here that is the same storage the
// browser uses, so one assertion reads either
vi.mock("@capacitor/preferences", () => ({
    Preferences: {
        get: async ({ key }: { key: string }) => ({ value: window.localStorage.getItem(key) }),
        set: async ({ key, value }: { key: string; value: string }) => window.localStorage.setItem(key, value),
        remove: async ({ key }: { key: string }) => window.localStorage.removeItem(key),
    },
}));

type Answer = { status?: number; body: unknown };

function serve(routes: Record<string, Answer>) {
    const calls: { path: string; method: string; body?: unknown }[] = [];

    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
        const path = url.replace(/^.*?(\/(me|apple-music)\/.*)$/, "$1");
        const method = init.method ?? "GET";

        calls.push({ path, method, body: init.body ? JSON.parse(init.body as string) : undefined });

        const answer = routes[`${method} ${path}`];

        if (!answer)
            return new Response(JSON.stringify({ message: "no route" }), { status: 404 });

        return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
    }));

    return calls;
}

const LINKED = { accounts: { appleMusic: { linkedAt: 1, storefront: "us", needsToken: false } }, appleMusicAvailable: true };

async function load() {
    vi.resetModules();

    return import("./apple-music");
}

describe("apple-music", () => {
    beforeEach(() => {
        window.localStorage.clear();
        // Linked from this device, by the account signed in
        window.localStorage.setItem("tempo.apple-music.linked-for", "u1");
        native.platform = "ios";
        native.authorize.mockReset();
        native.userToken.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe("linkAppleMusic", () => {
        it("asks for access and hands the token to the server", async () => {
            const calls = serve({
                "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } },
                "PUT /me/accounts/apple-music": { body: { accounts: LINKED.accounts } },
            });

            native.authorize.mockResolvedValue({ status: "authorized", userToken: "user-token" });

            const { linkAppleMusic } = await load();
            const result = await linkAppleMusic({}, "u1");

            expect(native.authorize).toHaveBeenCalledWith({ developerToken: "dev" });
            expect(calls.at(-1)).toEqual({ path: "/me/accounts/apple-music", method: "PUT", body: { userToken: "user-token", refresh: false } });
            expect(result.accounts.appleMusic?.storefront).toBe("us");
        });

        it("remembers which account linked it here", async () => {
            window.localStorage.clear();

            serve({
                "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } },
                "PUT /me/accounts/apple-music": { body: { accounts: LINKED.accounts } },
            });

            native.authorize.mockResolvedValue({ status: "authorized", userToken: "user-token" });

            const { linkAppleMusic } = await load();
            await linkAppleMusic({}, "u1");

            expect(window.localStorage.getItem("tempo.apple-music.linked-for")).toBe("u1");
        });

        it("says so when the listener does not allow it, and sends nothing", async () => {
            const calls = serve({ "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } } });

            native.authorize.mockResolvedValue({ status: "denied" });

            const { linkAppleMusic, AppleMusicNotAllowedError } = await load();

            await expect(linkAppleMusic({}, "u1")).rejects.toBeInstanceOf(AppleMusicNotAllowedError);
            expect(calls.some(call => call.method === "PUT")).toBe(false);
        });

        it("says a subscription is needed, and links nothing, without one", async () => {
            const calls = serve({ "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } } });

            native.authorize.mockResolvedValue({ status: "authorized", userToken: "user-token", canPlayCatalogContent: false });

            const { linkAppleMusic, AppleMusicNoSubscriptionError } = await load();

            await expect(linkAppleMusic({}, "u1")).rejects.toBeInstanceOf(AppleMusicNoSubscriptionError);
            expect(calls.some(call => call.method === "PUT")).toBe(false);
        });

        it("passes on the server's reason when it refuses", async () => {
            serve({
                "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } },
                "PUT /me/accounts/apple-music": { status: 400, body: { message: "Apple Music did not accept that sign-in." } },
            });

            native.authorize.mockResolvedValue({ status: "authorized", userToken: "user-token" });

            const { linkAppleMusic } = await load();

            await expect(linkAppleMusic({}, "u1")).rejects.toThrow("Apple Music did not accept that sign-in.");
        });
    });

    describe("refreshAppleMusicLink", () => {
        it("hands over the current token without asking anything", async () => {
            const calls = serve({
                "GET /me/accounts": { body: LINKED },
                "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } },
                "PUT /me/accounts/apple-music": { body: { accounts: LINKED.accounts } },
            });

            native.userToken.mockResolvedValue({ status: "authorized", userToken: "current" });

            const { refreshAppleMusicLink } = await load();
            await refreshAppleMusicLink({}, "u1");

            expect(native.authorize).not.toHaveBeenCalled();
            expect(native.userToken).toHaveBeenCalledWith({ developerToken: "dev", fresh: false });
            // Only ever updates a link, so one removed meanwhile stays removed
            expect(calls.at(-1)?.body).toEqual({ userToken: "current", refresh: true });
        });

        it("skips MusicKit's cached token when the server has refused one", async () => {
            serve({
                "GET /me/accounts": { body: { ...LINKED, accounts: { appleMusic: { ...LINKED.accounts.appleMusic, needsToken: true } } } },
                "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } },
                "PUT /me/accounts/apple-music": { body: { accounts: LINKED.accounts } },
            });

            native.userToken.mockResolvedValue({ status: "authorized", userToken: "current" });

            const { refreshAppleMusicLink } = await load();
            await refreshAppleMusicLink({}, "u1");

            expect(native.userToken).toHaveBeenCalledWith({ developerToken: "dev", fresh: true });
        });

        it("does nothing for somebody who has not linked Apple Music", async () => {
            const calls = serve({ "GET /me/accounts": { body: { accounts: {}, appleMusicAvailable: true } } });

            const { refreshAppleMusicLink } = await load();
            await refreshAppleMusicLink({}, "u1");

            expect(calls.map(call => call.path)).toEqual(["/me/accounts"]);
            expect(native.userToken).not.toHaveBeenCalled();
        });

        it("sends nothing when access has been withdrawn", async () => {
            const calls = serve({
                "GET /me/accounts": { body: LINKED },
                "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } },
            });

            native.userToken.mockResolvedValue({ status: "denied" });

            const { refreshAppleMusicLink } = await load();
            await refreshAppleMusicLink({}, "u1");

            expect(calls.some(call => call.method === "PUT")).toBe(false);
        });

        it("hands over nothing for an account that linked somewhere else", async () => {
            window.localStorage.clear();

            const calls = serve({});

            const { refreshAppleMusicLink } = await load();
            await refreshAppleMusicLink({}, "u1");

            expect(calls.length).toBe(0);
            expect(native.userToken).not.toHaveBeenCalled();
        });

        it("hands over nothing for somebody else signed in after the one who linked it here", async () => {
            // u1 linked here, signed out without it being forgotten, and u2 signed in
            const calls = serve({});

            const { refreshAppleMusicLink } = await load();
            await refreshAppleMusicLink({}, "u2");

            expect(calls.length).toBe(0);
        });

        it("forgets it was linked here on signing out", async () => {
            const { forgetAppleMusicHere } = await load();

            forgetAppleMusicHere();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(window.localStorage.getItem("tempo.apple-music.linked-for")).toBeNull();
        });

        it("runs once a launch", async () => {
            const calls = serve({ "GET /me/accounts": { body: { accounts: {}, appleMusicAvailable: true } } });

            const { refreshAppleMusicLink } = await load();
            await refreshAppleMusicLink({}, "u1");
            await refreshAppleMusicLink({}, "u1");

            expect(calls.length).toBe(1);
        });

        it("does not try from the Android app", async () => {
            native.platform = "android";

            const calls = serve({});

            const { refreshAppleMusicLink, canLinkAppleMusicHere } = await load();
            await refreshAppleMusicLink({}, "u1");

            expect(canLinkAppleMusicHere()).toBe(false);
            expect(calls.length).toBe(0);
        });
    });

    describe("in a browser", () => {
        function musicKit(instance: { isAuthorized: boolean; musicUserToken?: string; authorize: () => Promise<string>; unauthorize?: () => Promise<void> }) {
            instance.unauthorize ??= vi.fn(async () => {
                instance.isAuthorized = false;
                instance.musicUserToken = undefined;
            });

            vi.stubGlobal("MusicKit", {
                configure: vi.fn(async () => instance),
                getInstance: () => instance,
            });
        }

        it("does not hand back a token the server has refused", async () => {
            native.platform = "web";

            const calls = serve({
                "GET /me/accounts": { body: { ...LINKED, accounts: { appleMusic: { ...LINKED.accounts.appleMusic, needsToken: true } } } },
                "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } },
            });

            const authorize = vi.fn(async () => "new");

            musicKit({ isAuthorized: true, musicUserToken: "refused", authorize });

            const { refreshAppleMusicLink } = await load();
            await refreshAppleMusicLink({}, "u1");

            expect(calls.some(call => call.method === "PUT")).toBe(false);
            // Nor asks: that is for the settings page, on a tap
            expect(authorize).not.toHaveBeenCalled();
        });

        it("opens Apple's sign-in before waiting on anything, once prepared", async () => {
            native.platform = "web";

            serve({
                "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } },
                "PUT /me/accounts/apple-music": { body: { accounts: LINKED.accounts } },
            });

            const authorize = vi.fn(async () => "user-token");

            musicKit({ isAuthorized: false, authorize });

            const { linkAppleMusic, prepareAppleMusicLink } = await load();
            await prepareAppleMusicLink({});

            const linking = linkAppleMusic({}, "u1");

            // Called in the same turn as the tap
            expect(authorize).toHaveBeenCalledTimes(1);

            await linking;
        });

        it("signs MusicKit out before signing in again, so it cannot answer with the token it holds", async () => {
            native.platform = "web";

            const calls = serve({
                "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } },
                "PUT /me/accounts/apple-music": { body: { accounts: LINKED.accounts } },
            });

            // Holds the refused token; a real sign-in yields a new one
            const instance: { isAuthorized: boolean; musicUserToken?: string; authorize: () => Promise<string> } = {
                isAuthorized: true,
                musicUserToken: "refused",
                authorize: vi.fn(async () => instance.musicUserToken ?? "new"),
            };

            musicKit(instance);

            const { linkAppleMusic, prepareAppleMusicLink } = await load();
            await prepareAppleMusicLink({});
            await linkAppleMusic({}, "u1");

            expect(calls.at(-1)?.body).toEqual({ userToken: "new", refresh: false });
        });

        it("says a sign-in that did not finish did not finish, rather than that access was refused", async () => {
            native.platform = "web";

            serve({ "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } } });

            musicKit({ isAuthorized: false, authorize: vi.fn(async () => { throw new Error("popup blocked"); }) });

            const { linkAppleMusic } = await load();

            await expect(linkAppleMusic({}, "u1")).rejects.toThrow(/did not finish/);
        });
    });
});
