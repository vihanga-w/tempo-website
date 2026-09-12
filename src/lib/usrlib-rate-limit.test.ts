import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import User from "./usrlib";

/**
 * What the user library does when the server says it is too busy.
 *
 * It used to do one thing everywhere - reload the page - which threw away
 * whatever the person was in the middle of, and on the recap poll it could
 * loop: the reload landed on a full-screen recap whose only exit sent another
 * rate-limited request. These pin the answers that replaced it, which differ by
 * what the caller can honestly do without.
 */
describe("a rate-limited Tempo", () => {
    /** A refusal with a Retry-After short enough not to slow the suite down. */
    const busy = () => new Response(null, { status: 429, headers: { "retry-after": "0.001" } });

    let user: User;

    beforeEach(() => {
        localStorage.clear();
        vi.spyOn(console, "warn").mockImplementation(() => { });

        user = new User();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("signs somebody out here even when the sign-out is refused", async () => {
        // The session is the server's to end, but being left signed in because
        // the request bounced is the one outcome nobody asked for - and it is
        // what the reload used to produce, token and all.
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(busy()));

        user.isLoggedIn = true;
        user.storedToken = "a-token";
        localStorage.setItem("tempo.a", "a-token");

        const confirmed = await user.logout();

        expect(confirmed).toBe(false);
        expect(user.isLoggedIn).toBe(false);
        expect(user.storedToken).toBeUndefined();
        expect(localStorage.getItem("tempo.a")).toBeNull();
    });

    it("says when the server did agree to the sign-out", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

        expect(await user.logout()).toBe(true);
    });

    it("does not sign somebody out over a session check it could not make", async () => {
        /*
         * A 429 is not an answer to "are you still signed in", and the caller
         * signs the reader out on a false. Asserted on a cold start, which is
         * the case that matters: isLoggedIn is false then for everybody, so
         * answering from it would have put a perfectly good session at the
         * sign-in prompt over a busy minute at launch. The private check is
         * worth reaching for directly - everything above it is a page going
         * blank.
         */
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(busy()));

        expect(user.isLoggedIn).toBe(false);
        expect(await (user as any).isUserAuthenticated()).toBe(true);
    });

    it("signs somebody out here even when the request cannot be sent at all", async () => {
        // Offline. The local half of signing out is ours to do, and somebody
        // left signed in because their train went into a tunnel is the exact
        // outcome this method exists to prevent.
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network unavailable")));

        user.isLoggedIn = true;
        user.storedToken = "a-token";
        localStorage.setItem("tempo.a", "a-token");

        const confirmed = await user.logout();

        expect(confirmed).toBe(false);
        expect(user.isLoggedIn).toBe(false);
        expect(user.storedToken).toBeUndefined();
        expect(localStorage.getItem("tempo.a")).toBeNull();
    });

    it("keeps the settings it holds rather than stalling sign-in", async () => {
        // Sign-in awaits this, so a throw here is an app that never finishes
        // starting.
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(busy()));

        await expect(user.loadSettings()).resolves.toEqual(user.settings);
    });

    it("reads a rate-limited recap poll as no recaps this time", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(busy()));

        await expect(user.getRecaps()).resolves.toEqual({ daily: null, weekly: null });
    });

    it("reads an empty day as an empty day, not a failure", async () => {
        // The server used to answer 404 with error: true for somebody who
        // simply had no recap, and this polls every thirty seconds.
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
            new Response(null, { status: 404 })
        ));

        await expect(user.getRecaps()).resolves.toEqual({ daily: null, weekly: null });
    });

    it("tries a refused seen-mark again, and confirms when it lands", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(busy())
            .mockResolvedValueOnce(new Response(null, { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        expect(await user.markRecapSeen("daily")).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("stops asking to mark a recap seen once the answer is settled", async () => {
        // A token that is not accepted will not be accepted on the third ask.
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
        vi.stubGlobal("fetch", fetchMock);

        expect(await user.markRecapSeen("daily")).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("raises rather than reporting an empty friends list", async () => {
        // An empty list reads as having no friends, and would be cached as
        // though that were true.
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(busy()));

        await expect(user.getFriends(["friends"])).rejects.toThrow(/rate limit/i);
    });

    it("raises rather than handing Discover an empty page", async () => {
        // Discover reads an empty page as the end of the feed and stops asking
        // for more, so a page that merely failed to arrive must not look like
        // one - it would end somebody's Discover for the rest of the sitting.
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(busy()));

        await expect(user.getMyFYP(1)).rejects.toThrow(/rate limit/i);
    });

    it("raises when the feed answers with no page at all", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: true, message: "nope" }), {
                status: 200, headers: { "content-type": "application/json" },
            })
        ));

        await expect(user.getMyFYP(1)).rejects.toThrow(/failed to fetch the feed/i);
    });

    it("raises rather than drawing somebody's week as empty", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(busy()));

        await expect(user.getRemoteUserPastWeekStats("someone")).rejects.toThrow(/rate limit/i);
    });
});
