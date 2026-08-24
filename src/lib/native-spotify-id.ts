import { InAppBrowser } from "@capgo/inappbrowser";

/**
 * Reads a signed-in user's Spotify username by letting them log in to Spotify
 * itself, in a webview we can script.
 *
 * A username is Tempo's account id, and the ordinary sign-in cannot hand it
 * over before the person has an account — a chicken-and-egg the bring-your-own
 * app flow keeps running into. But the Spotify account pages already know who
 * is logged in, and a webview parked on spotify.com holds that session's
 * cookies, so a script injected there can ask Spotify's own account API for the
 * username directly. That is what this does: open the profile page, wait for
 * the login to land back on it, then read the name out and hand it back.
 *
 * Nothing is typed by the person into our webview and no password passes
 * through our code — the login happens on Spotify's real pages, and all we
 * receive is the username those pages already display.
 */

const PROFILE_URL = "https://www.spotify.com/account/profile/";

/** How long to wait for a login before giving up, so this cannot hang forever. */
const DEADLINE_MS = 5 * 60 * 1000;

export interface ProbeOptions {
    /**
     * Leave the webview open when a username is found.
     *
     * The webview holds the Spotify session the person just logged into, so
     * sending it on to the authorise URL means Spotify already knows them and
     * goes straight to consent. Closing it and opening a fresh one would throw
     * that away and ask them to log in a second time.
     *
     * The caller owns the webview from that point and must either continue it
     * or close it — see continueInWebView and closeWebView.
     */
    keepOpenOnSuccess?: boolean;
}

export interface SpotifyIdResult {
    /** The username, which is the account's Spotify id — present on success. */
    username?: string;
    /** Why nothing came back: the person closed it, or the wait ran out. */
    reason?: "closed" | "timeout" | "unavailable";
    /**
     * Everything the injected probe saw, kept whether it succeeded or not.
     *
     * The profile page is Spotify's, not ours, and it changes without notice —
     * so when extraction misses, this is what says which strategy fired, what
     * the account API answered, and what the page looked like, rather than a
     * bare failure with nowhere to start.
     */
    diagnostics?: Record<string, unknown>;
}

/**
 * The script that runs inside the Spotify page.
 *
 * Built as a string because it executes in the webview's world, not ours. It
 * tries the account API first — a same-origin fetch that carries the login
 * cookies and returns the username as data rather than as markup to be scraped
 * — and falls back to reading the page only if that comes back empty. Whatever
 * happens, it posts one message back, so the app side always hears exactly once.
 */
function buildProbeScript(): string {
    return `(async () => {
        const report = (payload) => {
            try {
                window.mobileApp.postMessage({ detail: Object.assign({ channel: "spotify-id" }, payload) });
            } catch (e) {
                // Nothing else can be done from in here if the bridge is absent
            }
        };

        const diagnostics = { href: location.href, strategies: {} };

        // Strategy 1: Spotify's own account API. Same origin, so the session
        // cookie rides along, and the username comes back as a plain field.
        try {
            const res = await fetch("/api/account-settings/v1/profile", {
                headers: { "Accept": "application/json" },
                credentials: "include",
            });

            diagnostics.strategies.api = { status: res.status };

            if (res.ok) {
                const body = await res.json();
                const username = body && body.profile && body.profile.username;

                diagnostics.strategies.api.username = username || null;

                if (username) {
                    report({ username: String(username), diagnostics });
                    return;
                }
            }
        } catch (e) {
            diagnostics.strategies.api = { error: String(e) };
        }

        // Strategy 2: read it off the rendered page. The profile page shows the
        // username next to a label; locales differ, so match the label loosely
        // and take the value beside it. Best-effort — a miss still reports, so
        // the diagnostics show what the page actually held.
        try {
            const labelled = Array.from(document.querySelectorAll("*")).find((el) =>
                el.children.length === 0 && /username/i.test(el.textContent || ""));

            let domUsername = null;

            if (labelled) {
                const row = labelled.closest("tr, li, div, section") || labelled.parentElement;
                const text = row ? row.textContent || "" : "";
                const match = text.replace(/username/i, "").trim().match(/[A-Za-z0-9._-]{3,}/);

                domUsername = match ? match[0] : null;
            }

            diagnostics.strategies.dom = { username: domUsername };

            if (domUsername) {
                report({ username: domUsername, diagnostics });
                return;
            }
        } catch (e) {
            diagnostics.strategies.dom = { error: String(e) };
        }

        report({ diagnostics });
    })();`;
}

/**
 * @returns the username on success, or a reason it could not be read. Never
 *          rejects — every exit resolves, so a caller can rely on being told
 *          what happened rather than having to catch.
 */
export async function probeSpotifyUserId(options: ProbeOptions = {}): Promise<SpotifyIdResult> {
    let latestUrl = PROFILE_URL;
    let probed = false;
    let settled = false;

    const listeners: { remove: () => Promise<void> }[] = [];

    return new Promise<SpotifyIdResult>(async (resolve) => {
        const finish = async (result: SpotifyIdResult) => {
            if (settled)
                return;

            settled = true;

            clearTimeout(timer);

            for (const l of listeners) {
                try { await l.remove(); } catch { }
            }

            // Handed to the caller rather than closed; anything that did not
            // find a username is closed here, since nobody is going to use it
            if (!(options.keepOpenOnSuccess && result.username))
                try { await InAppBrowser.close(); } catch { }

            resolve(result);
        };

        const timer = setTimeout(() => finish({ reason: "timeout" }), DEADLINE_MS);

        // On the profile page and logged in — Spotify sends an unauthenticated
        // visitor to accounts.spotify.com/login and only back here once they
        // are through, so this URL is itself the signal that the login landed.
        const onProfilePage = () => latestUrl.includes("/account/profile");

        const runProbe = async () => {
            if (probed || !onProfilePage())
                return;

            probed = true;

            try {
                await InAppBrowser.executeScript({ code: buildProbeScript() });
            } catch {
                await finish({ reason: "unavailable" });
            }
        };

        try {
            listeners.push(await InAppBrowser.addListener("messageFromWebview", (event) => {
                const detail = (event?.detail ?? {}) as Record<string, unknown>;

                if (detail.channel !== "spotify-id")
                    return;

                const username = typeof detail.username === "string" ? detail.username : undefined;

                // A probe that ran but found nothing lets the person move around
                // — they may not have finished logging in — so only a username
                // ends the flow here. A fruitless probe re-arms for the next
                // page load rather than closing on them.
                if (username)
                    finish({ username, diagnostics: detail.diagnostics as Record<string, unknown> });
                else
                    probed = false;
            }));

            listeners.push(await InAppBrowser.addListener("urlChangeEvent", (state) => {
                latestUrl = state.url;
            }));

            listeners.push(await InAppBrowser.addListener("browserPageLoaded", () => {
                // A short beat so the profile page's own scripts have run and
                // the account API is ready to answer
                setTimeout(runProbe, 400);
            }));

            listeners.push(await InAppBrowser.addListener("closeEvent", () => finish({ reason: "closed" })));

            await InAppBrowser.openWebView({
                url: PROFILE_URL,
                title: "Sign in with Spotify",
                isInspectable: true,
            });
        } catch {
            await finish({ reason: "unavailable" });
        }
    });
}

/**
 * Sends a webview kept open by probeSpotifyUserId on to the next URL.
 *
 * Used to join the ordinary sign-in without a second login: the session is
 * already in this webview, so Spotify goes straight to the consent screen.
 */
export async function continueInWebView(url: string): Promise<void> {
    await InAppBrowser.setUrl({ url });
}

/** Closes a webview kept open by probeSpotifyUserId. Never throws. */
export async function closeWebView(): Promise<void> {
    try {
        await InAppBrowser.close();
    } catch { }
}
