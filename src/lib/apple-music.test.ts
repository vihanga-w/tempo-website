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
            const result = await linkAppleMusic({});

            expect(native.authorize).toHaveBeenCalledWith({ developerToken: "dev" });
            expect(calls.at(-1)).toEqual({ path: "/me/accounts/apple-music", method: "PUT", body: { userToken: "user-token" } });
            expect(result.accounts.appleMusic?.storefront).toBe("us");
        });

        it("says so when the listener does not allow it, and sends nothing", async () => {
            const calls = serve({ "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } } });

            native.authorize.mockResolvedValue({ status: "denied" });

            const { linkAppleMusic, AppleMusicNotAllowedError } = await load();

            await expect(linkAppleMusic({})).rejects.toBeInstanceOf(AppleMusicNotAllowedError);
            expect(calls.some(call => call.method === "PUT")).toBe(false);
        });

        it("passes on the server's reason when it refuses", async () => {
            serve({
                "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } },
                "PUT /me/accounts/apple-music": { status: 400, body: { message: "Apple Music did not accept that sign-in." } },
            });

            native.authorize.mockResolvedValue({ status: "authorized", userToken: "user-token" });

            const { linkAppleMusic } = await load();

            await expect(linkAppleMusic({})).rejects.toThrow("Apple Music did not accept that sign-in.");
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
            await refreshAppleMusicLink({});

            expect(native.authorize).not.toHaveBeenCalled();
            expect(native.userToken).toHaveBeenCalledWith({ developerToken: "dev", fresh: false });
            expect(calls.at(-1)?.body).toEqual({ userToken: "current" });
        });

        it("skips MusicKit's cached token when the server has refused one", async () => {
            serve({
                "GET /me/accounts": { body: { ...LINKED, accounts: { appleMusic: { ...LINKED.accounts.appleMusic, needsToken: true } } } },
                "GET /apple-music/developer-token": { body: { token: "dev", expiresAt: 0 } },
                "PUT /me/accounts/apple-music": { body: { accounts: LINKED.accounts } },
            });

            native.userToken.mockResolvedValue({ status: "authorized", userToken: "current" });

            const { refreshAppleMusicLink } = await load();
            await refreshAppleMusicLink({});

            expect(native.userToken).toHaveBeenCalledWith({ developerToken: "dev", fresh: true });
        });

        it("does nothing for somebody who has not linked Apple Music", async () => {
            const calls = serve({ "GET /me/accounts": { body: { accounts: {}, appleMusicAvailable: true } } });

            const { refreshAppleMusicLink } = await load();
            await refreshAppleMusicLink({});

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
            await refreshAppleMusicLink({});

            expect(calls.some(call => call.method === "PUT")).toBe(false);
        });

        it("runs once a launch", async () => {
            const calls = serve({ "GET /me/accounts": { body: { accounts: {}, appleMusicAvailable: true } } });

            const { refreshAppleMusicLink } = await load();
            await refreshAppleMusicLink({});
            await refreshAppleMusicLink({});

            expect(calls.length).toBe(1);
        });

        it("does not try from the Android app", async () => {
            native.platform = "android";

            const calls = serve({});

            const { refreshAppleMusicLink, canLinkAppleMusicHere } = await load();
            await refreshAppleMusicLink({});

            expect(canLinkAppleMusicHere()).toBe(false);
            expect(calls.length).toBe(0);
        });
    });
});
