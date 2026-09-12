import { afterEach, describe, expect, it, vi } from "vitest";

import {
    fetchThroughRateLimit, rateLimitPauseMs, backoffPauseMs, MAX_RATE_LIMIT_PAUSE_MS,
} from "./rate-limit";

const response = (status: number, headers?: Record<string, string>) =>
    new Response(null, { status, headers });

/**
 * What replaced reloading the app at a rate limit.
 *
 * The two things worth pinning are that a pause is preferred to a reload at all
 * - the reload is what took people's half-typed searches and, on a timer, could
 * loop - and that running out of tries hands the refusal back rather than
 * acting on it, since only the caller knows whether stale data, nothing or an
 * error is the honest answer in its own case.
 */
describe("waiting out a rate limit", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("sends one request when the first is not rate limited", async () => {
        const fetchMock = vi.fn().mockResolvedValue(response(200));
        vi.stubGlobal("fetch", fetchMock);

        const req = await fetchThroughRateLimit("https://example.test/thing");

        expect(req.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not retry a refusal that is not a rate limit", async () => {
        // A 500 is the caller's to handle, exactly as it was before.
        const fetchMock = vi.fn().mockResolvedValue(response(500));
        vi.stubGlobal("fetch", fetchMock);

        const req = await fetchThroughRateLimit("https://example.test/thing");

        expect(req.status).toBe(500);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("waits, asks again, and returns what it gets", async () => {
        vi.useFakeTimers();
        vi.spyOn(console, "warn").mockImplementation(() => { });

        const fetchMock = vi.fn()
            .mockResolvedValueOnce(response(429))
            .mockResolvedValueOnce(response(200));
        vi.stubGlobal("fetch", fetchMock);

        const pending = fetchThroughRateLimit("https://example.test/thing");

        await vi.advanceTimersByTimeAsync(1000);

        const req = await pending;

        expect(req.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("hands the rate limit back rather than acting on it", async () => {
        // Whatever happens, not a reload: the caller decides what an unanswered
        // request means where it is.
        vi.useFakeTimers();
        vi.spyOn(console, "warn").mockImplementation(() => { });

        const fetchMock = vi.fn().mockResolvedValue(response(429));
        vi.stubGlobal("fetch", fetchMock);

        const pending = fetchThroughRateLimit("https://example.test/thing", undefined, 3);

        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(2000);

        const req = await pending;

        expect(req.status).toBe(429);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("lets a request that cannot be sent reach the caller", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchThroughRateLimit("https://example.test/thing")).rejects.toThrow("Failed to fetch");
    });
});

describe("how long to wait", () => {
    it("waits as long as the server asks", () => {
        expect(rateLimitPauseMs(response(429, { "retry-after": "3" }), 1)).toBe(3000);
    });

    it("doubles the wait when the server does not say", () => {
        expect(backoffPauseMs(1)).toBe(1000);
        expect(backoffPauseMs(2)).toBe(2000);
        expect(backoffPauseMs(3)).toBe(4000);
    });

    it("will not sit on a request all day, however patient it is asked to be", () => {
        // A page that waits half a minute to draw is no better than one that
        // fails, and the caller can always ask again.
        expect(rateLimitPauseMs(response(429, { "retry-after": "600" }), 1)).toBe(MAX_RATE_LIMIT_PAUSE_MS);
        expect(backoffPauseMs(20)).toBe(MAX_RATE_LIMIT_PAUSE_MS);
    });

    it("reads a Retry-After sent as a date", () => {
        // The header is allowed to be an HTTP date, which as a number is NaN -
        // and the back-off it fell through to is shorter than any date a server
        // would name, so the tries were spent while the limit was still on.
        const in4s = new Date(Date.now() + 4000).toUTCString();

        expect(rateLimitPauseMs(response(429, { "retry-after": in4s }), 1)).toBeGreaterThan(2500);
    });

    it("ignores a date that has already passed", () => {
        const gone = new Date(Date.now() - 60e3).toUTCString();

        expect(rateLimitPauseMs(response(429, { "retry-after": gone }), 1)).toBe(1000);
    });

    it("falls back to the back-off when Retry-After is nonsense", () => {
        expect(rateLimitPauseMs(response(429, { "retry-after": "soon" }), 2)).toBe(2000);
    });
});
