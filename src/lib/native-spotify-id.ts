/**
 * Reads a signed-in user's Spotify username by letting them log in to Spotify
 * itself, in a webview we can script.
 *
 * A username is Tempo's account id, and sign-in cannot hand it over before the
 * person has an account - a chicken-and-egg the bring-your-own-app flow keeps
 * running into. Spotify's own account pages know who is logged in, so a script
 * injected there can ask Spotify's account API directly.
 *
 * The webview is only on screen while it needs them. Spotify sends a visitor to
 * log in first, which they have to see; the moment that lands on an account page
 * it goes away again, and comes back only if Spotify asks them to log in afresh.
 *
 * No password passes through Tempo's code: the login happens on Spotify's real
 * pages, and the script only reads what those pages already show.
 */

/**
 * Spotify puts a region in most of these paths - /uk/account/, /de/account/ -
 * and which one depends on the account, so matching a particular one would work
 * for whoever it was written against and quietly fail for everybody else. These
 * match around the region instead of naming it.
 */
export const LOGIN_PATTERN = "accounts\\.spotify\\.com\\/(?:[a-z-]{2,5}\\/)?login";
export const ACCOUNT_PATTERN = "spotify\\.com\\/(?:[a-z-]{2,5}\\/)?account\\/";

const ACCOUNT_URL = "https://www.spotify.com/account/profile/";

/** How long to wait for a login before giving up, so this cannot hang forever. */
const DEADLINE_MS = 5 * 60 * 1000;

/** How often to ask the page where it is and who is logged in. */
const POLL_MS = 900;

export interface ProbeOptions {
    /**
     * Leave the webview open when a username is found.
     *
     * It holds the Spotify session the person just logged into, so sending it on
     * to the authorise URL means Spotify goes straight to consent rather than
     * asking them to log in a second time.
     */
    keepOpenOnSuccess?: boolean;
}

export interface SpotifyIdResult {
    /** The username, which is the account's Spotify id - present on success. */
    username?: string;
    reason?: "closed" | "timeout" | "unavailable";
    diagnostics?: Record<string, unknown>;
}

interface CordovaBrowserRef {
    addEventListener: (name: string, cb: (event?: unknown) => void) => void;
    executeScript: (details: { code: string }, cb?: (results: unknown[]) => void) => void;
    show: () => void;
    hide: () => void;
    close: () => void;
}

/**
 * Reports where the page is and, on an account page, who is logged in.
 *
 * The account API is a promise and this has to answer at once - Cordova hands
 * back whatever the script evaluates to - so the request is started once and
 * left on the window for a later call to collect.
 */
function buildProbeScript(): string {
    return `(function () {
        var href = location.href;

        if (/${LOGIN_PATTERN}/i.test(href)) {
            /*
             * Only worth showing once it is actually drawn.
             *
             * Spotify's login renders client-side, so revealing on the URL
             * alone puts a blank white page in front of somebody - and if the
             * session turns out to be saved, that page is replaced a moment
             * later by a redirect they never needed to see.
             */
            var form = document.querySelector('input[type="password"], input[type="email"], input[type="text"]');
            var action = document.querySelector("button, [type=submit]");

            return {
                page: "login",
                href: href,
                rendered: document.readyState === "complete" && !!form && !!action,
            };
        }

        if (!/${ACCOUNT_PATTERN}/i.test(href))
            return { page: "other", href: href };

        if (!window.__tempoIdStarted) {
            window.__tempoIdStarted = true;

            fetch("/api/account-settings/v1/profile", {
                headers: { Accept: "application/json" },
                credentials: "include",
            })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (body) {
                    window.__tempoId = body && body.profile && body.profile.username;
                    window.__tempoIdDone = true;
                })
                .catch(function (e) {
                    window.__tempoIdError = String(e);
                    window.__tempoIdDone = true;
                });
        }

        return {
            page: "account",
            href: href,
            username: window.__tempoId,
            done: !!window.__tempoIdDone,
            error: window.__tempoIdError,
        };
    })()`;
}

/** The webview this module is holding, so it can be handed on or closed later. */
let activeRef: CordovaBrowserRef | undefined;

/**
 * @returns the username, or the reason nothing came back. Never rejects: every
 *          exit resolves, so callers are told what happened.
 */
export function probeSpotifyUserId(options: ProbeOptions = {}): Promise<SpotifyIdResult> {
    return new Promise<SpotifyIdResult>((resolve) => {
        const iab = (window as unknown as {
            cordova?: { InAppBrowser?: { open: (url: string, target: string, opts?: string) => CordovaBrowserRef } };
        }).cordova?.InAppBrowser;

        if (!iab) {
            resolve({ reason: "unavailable" });

            return;
        }

        let ref: CordovaBrowserRef;

        try {
            /*
             * Opened on screen, and put away as soon as it is not needed.
             *
             * Opening it hidden would be better - most of the time the session
             * is saved and nobody needs to see any of this - but a hidden
             * webview never loads: the plugin asks for the page, and WebKit
             * does not drive the load while the view is outside any window, so
             * it sits on about:blank indefinitely and the whole flow stalls
             * behind it.
             */
            /*
             * On screen while it loads, and put away the moment it is not
             * needed.
             *
             * It cannot load out of sight: WebKit drives a load only for a view
             * inside a window, so a webview that is hidden - at open, or hidden
             * again straight after - stops at about:blank and the flow stalls
             * behind it. Both were tried; this is the cost of the plugin.
             */
            ref = iab.open(ACCOUNT_URL, "_blank", "location=no,toolbar=no");

        } catch (ex) {
            resolve({ reason: "unavailable", diagnostics: { error: String(ex) } });

            return;
        }

        activeRef = ref;

        const code = buildProbeScript();

        let settled = false;
        let shown = true;
        let last: Record<string, unknown> | undefined;

        const finish = (result: SpotifyIdResult) => {
            if (settled)
                return;

            settled = true;

            clearInterval(poll);
            clearTimeout(deadline);

            if (!(options.keepOpenOnSuccess && result.username)) {
                try { ref.close(); } catch { }

                activeRef = undefined;
            }

            resolve({ ...result, diagnostics: result.diagnostics ?? last });
        };

        const attempt = () => {
            if (settled)
                return;

            try {
                ref.executeScript({ code }, (results) => {
                    const value = (Array.isArray(results) ? results[0] : undefined) as Record<string, unknown> | undefined;

                    if (!value)
                        return;

                    last = value;

                    /*
                     * On screen only while Spotify needs them. Past the login
                     * there is nothing to look at and nothing to do, so it goes
                     * away; if Spotify sends them back to log in - a session
                     * that expired, a wrong password - it returns.
                     */
                    if (value.page === "login" && !shown) {
                        shown = true;

                        try { ref.show(); } catch { }
                    } else if (value.page === "account" && shown) {
                        shown = false;

                        try { ref.hide(); } catch { }
                    }

                    const username = (typeof value.username === "string" ? value.username : "").trim();

                    if (username !== "")
                        finish({ username });
                });
            } catch { }
        };

        ref.addEventListener("loadstop", attempt);
        ref.addEventListener("exit", () => finish({ reason: "closed" }));

        const poll = setInterval(attempt, POLL_MS);
        const deadline = setTimeout(() => finish({ reason: "timeout" }), DEADLINE_MS);

        attempt();
    });
}

/**
 * Sends the webview left open by the probe on to the next URL.
 *
 * Navigated from inside the page, because this plugin has no method for it -
 * and shown again, since whatever comes next is for the person to see.
 */
export async function continueInWebView(url: string): Promise<void> {
    if (!activeRef)
        return;

    try { activeRef.show(); } catch { }

    activeRef.executeScript({ code: `location.href = ${JSON.stringify(url)};` });
}

/** Closes the webview left open by the probe. Never throws. */
export async function closeWebView(): Promise<void> {
    try { activeRef?.close(); } catch { }

    activeRef = undefined;
}
