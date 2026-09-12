/**
 * Waiting out a rate limit, rather than reloading the app at one.
 *
 * Every request the user library makes used to answer an HTTP 429 with
 * `window.location.reload()`. It threw away whatever the person was in the
 * middle of - a half-typed search, a page they had scrolled - to no end, since
 * the reload asks for everything again and arrives in the same bucket. On
 * anything running to a timer it could also loop: the recap poll reloaded onto
 * a full-screen recap whose only exit sent another rate-limited request, which
 * reloaded again.
 *
 * A pause is what the server is actually asking for.
 */

/** The longest to sit on a request, however patient the server asks us to be. */
export const MAX_RATE_LIMIT_PAUSE_MS = 8000;

/**
 * How long to wait before trying again.
 *
 * The server's own Retry-After where it sends one, since it knows what its
 * bucket is doing, and a doubling back-off otherwise - a second, then two, then
 * four. Capped either way: a page that waits half a minute to draw is no better
 * than one that fails, and the caller can always ask again.
 */
export function rateLimitPauseMs(req: Response, attempt: number): number {
    const retryAfter = Number(req.headers.get("retry-after"));

    if (Number.isFinite(retryAfter) && retryAfter > 0)
        return Math.min(retryAfter * 1000, MAX_RATE_LIMIT_PAUSE_MS);

    return backoffPauseMs(attempt);
}

/**
 * The same doubling back-off, for a try with no response to read - a request
 * that could not be sent at all.
 */
export function backoffPauseMs(attempt: number): number {
    return Math.min(1000 * (2 ** (attempt - 1)), MAX_RATE_LIMIT_PAUSE_MS);
}

/**
 * Fetch, waiting out a rate limit if there is one.
 *
 * Hands back whatever it ends up with rather than acting on it: a caller still
 * rate-limited after its tries reads the response as it would any other
 * refusal, and decides for itself whether stale data, nothing, or an error is
 * the right answer in its own case. Only a 429 is retried - everything else,
 * including a request that cannot be sent at all, reaches the caller exactly as
 * it did before.
 *
 * `attempts` counts the first try, so the default is one request and two more
 * after a pause.
 */
export async function fetchThroughRateLimit(
    url: string,
    init?: RequestInit,
    attempts: number = 3,
): Promise<Response> {
    let req = await fetch(url, init);

    for (let attempt = 1; req.status == 429 && attempt < attempts; attempt++) {
        const pause = rateLimitPauseMs(req, attempt);

        console.warn(
            "Rate limited by", url, "- waiting", pause, "ms, then try", attempt + 1, "of", attempts
        );

        await new Promise(resolve => setTimeout(resolve, pause));

        req = await fetch(url, init);
    }

    return req;
}

/**
 * A request that is still rate-limited after waiting.
 *
 * Raised rather than reloaded at, and rather than returned as an empty result,
 * where a caller has nothing to fall back on: "we could not ask just now" and
 * "there is nothing there" are different answers, and a page that quietly draws
 * the second when the first is true is how somebody comes to believe their
 * listening has been lost.
 */
export class RateLimitedError extends Error {
    constructor(public readonly url: string) {
        super("Still rate limited after waiting: " + url);

        this.name = "RateLimitedError";
    }
}
