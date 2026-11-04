/**
 * Links that open the Tempo app.
 *
 * Another app hands somebody over to Tempo with a link to a Tempo page: Lilt sends them to
 * /connect, where Tempo makes their Spotify app for them, which only the native app can do. iOS
 * opens the app for https://tempo.vihangaw.xyz/connect… (a Universal Link: the
 * apple-app-site-association file and the associated-domains entitlement), and for
 * tempo://connect… (the URL scheme, for the page's own "Open Tempo" button, since a Universal Link
 * does not fire when it is typed in or followed from the same site).
 *
 * Either way the app is told the URL and shows the same page inside itself, query and all (the
 * page reads account=identity and the rest from it). Only the routes listed here are followed: a
 * link is something any other app or page can send, so it never chooses where the app goes beyond
 * them. The page treats the query as untrusted too.
 */

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

const HOST = "tempo.vihangaw.xyz";
const SCHEME = "tempo:";

/** Pages another app may open the app on. */
const ROUTES = ["/connect"];

/** Where in the app a link should go, or null for a link the app does not follow. */
export function inAppPath(raw: string): string | null {
    let url: URL;

    try {
        url = new URL(raw);
    } catch {
        return null;
    }

    let path: string;

    if (url.protocol === SCHEME) {
        // tempo://connect?x parses with "connect" as the host
        path = "/" + `${url.host}${url.pathname}`.replace(/^\/+/, "");
    } else if (url.protocol === "https:" && url.host === HOST) {
        path = url.pathname;
    } else {
        return null;
    }

    path = path.replace(/\/+$/, "") || "/";

    if (!ROUTES.some(route => path === route || path.startsWith(route + "/")))
        return null;

    return path + url.search;
}

/** The launch link already acted on in this run of the app (kept across page loads). */
const HANDLED_KEY = "tempo.app-link-handled";

function go(raw: string) {
    const path = inAppPath(raw);

    if (path && window.location.pathname + window.location.search !== path)
        window.location.href = path;
}

/**
 * Follows links that open the app: while it runs, and the one it was launched by.
 *
 * Every page load sets this up again (the app moves between pages by loading them), and the launch
 * link stays the same for the whole run, so it is followed once: otherwise leaving /connect would
 * load a page that sent the person straight back.
 */
export function listenForAppLinks() {
    if (!Capacitor.isNativePlatform())
        return;

    void App.addListener("appUrlOpen", event => go(event.url));

    void App.getLaunchUrl().then(launch => {
        if (!launch?.url)
            return;

        try {
            if (sessionStorage.getItem(HANDLED_KEY) === launch.url)
                return;

            sessionStorage.setItem(HANDLED_KEY, launch.url);
        } catch { }

        go(launch.url);
    }).catch(() => { });
}
