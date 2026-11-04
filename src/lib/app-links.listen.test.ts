import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The app as iOS runs it: native, with links arriving as appUrlOpen events. Stubbed so the
 * real handler (listenForAppLinks and the page-wide follower) can be driven end to end.
 */
const listeners: ((e: { url: string }) => void)[] = [];

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/app", () => ({
    App: {
        addListener: (_: string, fn: (e: { url: string }) => void) => {
            listeners.push(fn);

            return Promise.resolve({ remove: () => { listeners.splice(listeners.indexOf(fn), 1); } });
        },
        getLaunchUrl: () => Promise.resolve(undefined),
    },
}));

const realLocation = window.location;
let location: { href: string; pathname: string; search: string };

beforeEach(() => {
    location = { href: "capacitor://localhost/", pathname: "/", search: "" };
    Object.defineProperty(window, "location", { value: location, configurable: true, writable: true });
    vi.useFakeTimers();
});

afterEach(() => {
    Object.defineProperty(window, "location", { value: realLocation, configurable: true, writable: true });
    vi.useRealTimers();
});

describe("a link that opens the app", () => {
    it("loads the page's own file, query kept, and not again once it is there", async () => {
        const { listenForAppLinks } = await import("./app-links");
        const stop = listenForAppLinks();

        listeners.forEach(fn => fn({ url: "tempo://connect?client_id=lilt&state=a" }));
        expect(location.href).toBe("/connect.html?client_id=lilt&state=a");

        // The page is now that file: the same link (later, so not taken as a cold-start repeat) stays put
        location.href = "capacitor://localhost/connect.html?client_id=lilt&state=a";
        location.pathname = "/connect.html";
        location.search = "?client_id=lilt&state=a";
        vi.advanceTimersByTime(2000);
        listeners.forEach(fn => fn({ url: "https://tempo.vihangaw.xyz/connect?client_id=lilt&state=a" }));
        expect(location.href).toBe("capacitor://localhost/connect.html?client_id=lilt&state=a");

        stop();
    });
});
