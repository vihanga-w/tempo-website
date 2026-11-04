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

/** How long the same link counts as one: a cold start reports it twice (event and launch URL). */
const SAME_LINK_MS = 1500;

/**
 * Turns links into page loads, each distinct link once: a cold start hears the launching link both
 * as an appUrlOpen event and as the launch URL, and a development build mounts everything twice.
 */
export function linkFollower(navigate: (path: string) => void, here: () => string, now: () => number = Date.now) {
    let last = { path: "", at: -Infinity };

    return (raw: string) => {
        const path = inAppPath(raw);

        if (!path)
            return;

        const at = now();

        if (path === last.path && at - last.at < SAME_LINK_MS)
            return;

        last = { path, at };

        if (here() !== path)
            navigate(path);
    };
}

/**
 * The file the app loads for a route. The app serves its pages from the static export, where
 * /connect is connect.html, and Capacitor answers any path without an extension with index.html:
 * loading /connect itself would open the home page instead.
 */
export function exportedFile(path: string): string {
    const at = path.search(/[?#]/);
    const route = at < 0 ? path : path.slice(0, at);
    const rest = at < 0 ? "" : path.slice(at);

    if (route === "/" || /\.[a-z0-9]+$/i.test(route))
        return path;

    return `${route}.html${rest}`;
}

/** The route the app is on, whichever way the page was loaded (/connect or /connect.html). */
export function currentRoute(pathname: string, search: string): string {
    return pathname.replace(/\.html$/, "") + search;
}

// One for the whole page, so a second mount shares what the first has seen.
const go = linkFollower(
    path => { window.location.href = exportedFile(path); },
    () => currentRoute(window.location.pathname, window.location.search),
);

/**
 * Follows links that open the app: while it runs, and the one it was launched by. Returns the
 * cleanup for the effect that calls it.
 *
 * Every page load sets this up again (the app moves between pages by loading them), and the launch
 * link stays the same for the whole run, so it is followed once: otherwise leaving /connect would
 * load a page that sent the person straight back.
 */
export function listenForAppLinks(): () => void {
    if (!Capacitor.isNativePlatform())
        return () => { };

    let stopped = false;
    const handle = App.addListener("appUrlOpen", event => go(event.url));

    void App.getLaunchUrl().then(launch => {
        if (stopped || !launch?.url)
            return;

        try {
            if (sessionStorage.getItem(HANDLED_KEY) === launch.url)
                return;

            sessionStorage.setItem(HANDLED_KEY, launch.url);
        } catch { }

        go(launch.url);
    }).catch(() => { });

    return () => {
        stopped = true;
        void handle.then(h => h.remove()).catch(() => { });
    };
}
