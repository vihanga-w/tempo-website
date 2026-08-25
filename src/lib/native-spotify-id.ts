import { InAppBrowser } from "@capgo/inappbrowser";

import { API_URL } from "./const";

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

/**
 * How long to try reading quietly before showing anything.
 *
 * Only reached when Spotify neither answers nor redirects - a slow connection,
 * most likely. A login is shown after it, which is the safe way to be wrong.
 */
const SILENT_MS = 12000;

const SILENT_CHANNEL = "spotify-id-silent";

/** Long enough for the server to finish writing before the app reads it back. */
const RETURN_SETTLE_MS = 1000;

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
    addEventListener: (name: string, cb: (event?: { url?: string }) => void) => void;
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

/**
 * Reads the username without anything appearing on screen.
 *
 * A webview has to be inside a window for WebKit to load it at all - hidden, it
 * stops at about:blank - so instead of hiding this one it is made a single
 * pixel in the corner. It is on screen in the sense that matters to WebKit and
 * in no sense that matters to a person.
 *
 * This uses the other browser plugin, the one whose executeScript only works on
 * the first page of the first webview. That limit is exactly the shape of this
 * job: an account with a live session goes to the profile page and stays on the
 * origin, which is the case that works. The moment Spotify wants a login it
 * redirects away, the scripting stops, and there would be nothing to see in a
 * one-pixel window anyway - so that is the signal to hand over to a real one.
 *
 * @returns the username, or nothing - in which case a login is needed.
 */
async function readSilently(): Promise<{ username?: string; needsLogin?: boolean }> {
    const listeners: { remove: () => Promise<void> }[] = [];

    const cleanUp = async () => {
        for (const l of listeners) {
            try { await l.remove(); } catch { }
        }
    };

    return new Promise<{ username?: string; needsLogin?: boolean }>(async (resolve) => {
        let settled = false;

        const finish = async (result: { username?: string; needsLogin?: boolean }) => {
            if (settled)
                return;

            settled = true;

            clearTimeout(deadline);
            clearInterval(poll);

            await cleanUp();

            // Kept open only when it worked and the caller wants it; otherwise
            // this pixel has done its job
            if (!result.username) {
                try { await InAppBrowser.close(); } catch { }

                active = undefined;
            }

            resolve(result);
        };

        const deadline = setTimeout(() => finish({ needsLogin: true }), SILENT_MS);

        try {
            listeners.push(await InAppBrowser.addListener("messageFromWebview", (event) => {
                const detail = (event?.detail ?? {}) as Record<string, unknown>;

                if (detail.channel !== SILENT_CHANNEL)
                    return;

                const username = (typeof detail.username === "string" ? detail.username : "").trim();

                if (username !== "")
                    finish({ username });
                else
                    // Answered, but with nobody logged in
                    finish({ needsLogin: true });
            }));

            listeners.push(await InAppBrowser.addListener("urlChangeEvent", (state) => {
                // Spotify asking for a login. Nothing further can be read
                // quietly, and a one-pixel window is no place to answer it.
                if (new RegExp(LOGIN_PATTERN, "i").test(state.url))
                    finish({ needsLogin: true });
            }));

            await InAppBrowser.openWebView({
                url: ACCOUNT_URL,
                title: "Spotify",
                isInspectable: true,
                // Present, and effectively invisible
                width: 1,
                height: 1,
                x: 0,
                y: 0,
            });

            active = { kind: "silent" };
        } catch {
            await finish({ needsLogin: true });

            return;
        }

        const ask = () => {
            if (settled)
                return;

            InAppBrowser.executeScript({ code: buildSilentScript() }).catch(() => { });
        };

        listeners.push(await InAppBrowser.addListener("browserPageLoaded", () => setTimeout(ask, 400)));

        const poll = setInterval(ask, POLL_MS);

        ask();
    });
}

/**
 * Asks Spotify's account API who is logged in, and posts the answer back.
 *
 * Written to post rather than return, because this plugin discards whatever a
 * script evaluates to - the bridge is the only way back from it.
 */
function buildSilentScript(): string {
    return `(function () {
        if (window.__tempoSilentAsked)
            return;

        if (!/${ACCOUNT_PATTERN}/i.test(location.href))
            return;

        window.__tempoSilentAsked = true;

        var say = function (payload) {
            try {
                payload.channel = ${JSON.stringify(SILENT_CHANNEL)};

                window.mobileApp.postMessage({ detail: payload });
            } catch (e) { }
        };

        fetch("/api/account-settings/v1/profile", {
            headers: { Accept: "application/json" },
            credentials: "include",
        })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (body) {
                say({ username: (body && body.profile && body.profile.username) || "" });
            })
            .catch(function () {
                // Left for the deadline: a failure here is indistinguishable
                // from not being logged in, and both end the same way
            });
    })()`;
}

/**
 * Which webview is currently open, if any.
 *
 * Two plugins are in play - one that can be made invisible and one that can be
 * scripted after a redirect - so what is on screen has to be remembered along
 * with how to talk to it.
 */
type ActiveView =
    | { kind: "silent" }
    | { kind: "visible"; ref: CordovaBrowserRef };

let active: ActiveView | undefined;

/**
 * @returns the username, or the reason nothing came back. Never rejects: every
 *          exit resolves, so callers are told what happened.
 */
export async function probeSpotifyUserId(options: ProbeOptions = {}): Promise<SpotifyIdResult> {
    /*
     * Quietly first.
     *
     * Almost everybody arrives with a Spotify session already saved, and for
     * them none of this needs to be seen: the profile page loads, the API says
     * who they are, and the whole trip happens in a window one pixel across.
     * Only when Spotify actually wants a login does anything appear.
     */
    const silent = await readSilently();

    if (silent.username) {
        if (!options.keepOpenOnSuccess)
            await closeWebView();

        return { username: silent.username };
    }

    return readWithLogin(options);
}

function readWithLogin(options: ProbeOptions = {}): Promise<SpotifyIdResult> {
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

        active = { kind: "visible", ref };

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

                active = undefined;
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
/**
 * Watches a sign-in through to the other side, and starts the app again.
 *
 * Sign-in begins on Tempo's own server and is handed onward, so arriving at
 * Tempo only means the end once Spotify has been seen in between. What comes
 * back is a page whose only real job is to report that it happened - reading it
 * is not the point, and being shown it is the opposite of the point.
 *
 * Starting over is what routes people correctly: by then the account is signed
 * in, so the ordinary rules take them where they should go. The wait is for the
 * server to finish writing what the restart is about to read.
 */
function watchForReturn(watch: (onUrl: (url: string) => void) => void): void {
    let atSpotify = false;
    let finishing = false;

    watch((url) => {
        if (/accounts\.spotify\.com/i.test(url)) {
            atSpotify = true;

            return;
        }

        if (finishing || !atSpotify || !url.startsWith(API_URL))
            return;

        finishing = true;

        const token = url.match(/[?&]st=([^&#]+)/)?.[1];

        if (token)
            fetch(`${API_URL}/appauth/complete/${token}`, { credentials: "include" })
                .catch((ex) => console.warn("Could not report the finished sign-in:", ex));

        setTimeout(() => {
            closeWebView();

            window.location.reload();
        }, RETURN_SETTLE_MS);
    });
}

export async function continueInWebView(url: string): Promise<void> {
    if (!active)
        return;

    if (active.kind === "silent") {
        // Grown from its pixel to the whole screen: whatever comes next -
        // a consent screen, most likely - is for the person to see
        try {
            await InAppBrowser.updateDimensions({
                width: Math.round(window.innerWidth),
                height: Math.round(window.innerHeight),
                x: 0,
                y: 0,
            });

            watchForReturn((onUrl) => {
                InAppBrowser.addListener("urlChangeEvent", (state) => onUrl(state.url))
                    .catch(() => { });
            });

            await InAppBrowser.setUrl({ url });
        } catch { }

        return;
    }

    const ref = active.ref;

    watchForReturn((onUrl) => {
        ref.addEventListener("loadstart", (event) => onUrl(event?.url ?? ""));
    });

    try { ref.show(); } catch { }

    ref.executeScript({ code: `location.href = ${JSON.stringify(url)};` });
}

/** Closes the webview left open by the probe. Never throws. */
export async function closeWebView(): Promise<void> {
    if (active?.kind === "visible")
        try { active.ref.close(); } catch { }
    else if (active?.kind === "silent")
        try { await InAppBrowser.close(); } catch { }

    active = undefined;
}
