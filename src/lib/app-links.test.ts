import { describe, expect, it } from "vitest";

import { currentRoute, exportedFile, inAppPath, linkFollower } from "./app-links";

describe("inAppPath", () => {
    it("follows the connect page on Tempo's site, query kept", () => {
        expect(inAppPath("https://tempo.vihangaw.xyz/connect?client=lilt&account=identity&state=s1"))
            .toBe("/connect?client=lilt&account=identity&state=s1");
    });

    it("follows the URL scheme the same way", () => {
        expect(inAppPath("tempo://connect?client=lilt&account=identity")).toBe("/connect?client=lilt&account=identity");
        expect(inAppPath("tempo:///connect?client=lilt")).toBe("/connect?client=lilt");
    });

    it("takes pages under /connect and a trailing slash", () => {
        expect(inAppPath("https://tempo.vihangaw.xyz/connect/manual")).toBe("/connect/manual");
        expect(inAppPath("https://tempo.vihangaw.xyz/connect/?a=1")).toBe("/connect?a=1");
    });

    it("refuses anything else", () => {
        for (const url of [
            "https://tempo.vihangaw.xyz/",
            "https://tempo.vihangaw.xyz/connect-spotify",
            "https://tempo.vihangaw.xyz/connections",
            "https://evil.example/connect",
            "https://tempo.vihangaw.xyz.evil.example/connect",
            "http://tempo.vihangaw.xyz/connect",
            "tempo://reauth",
            "javascript:alert(1)",
            "not a url",
        ])
            expect(inAppPath(url), url).toBeNull();
    });
});

describe("linkFollower", () => {
    const setup = (here = "/") => {
        let t = 0;
        const went: string[] = [];
        const follow = linkFollower(p => went.push(p), () => here, () => t);
        return { follow, went, tick: (ms: number) => { t += ms; } };
    };

    it("takes the same link once when it arrives twice at a cold start", () => {
        const { follow, went, tick } = setup();
        follow("tempo://connect?client=lilt&state=a");
        tick(200);
        follow("tempo://connect?client=lilt&state=a");
        expect(went).toEqual(["/connect?client=lilt&state=a"]);
    });

    it("takes it again later, and a different link at once", () => {
        const { follow, went, tick } = setup();
        follow("tempo://connect?state=a");
        follow("tempo://connect?state=b");
        tick(2000);
        follow("tempo://connect?state=b");
        expect(went).toEqual(["/connect?state=a", "/connect?state=b", "/connect?state=b"]);
    });

    it("stays put when already there, and ignores links it does not follow", () => {
        const { follow, went } = setup("/connect?state=a");
        follow("https://tempo.vihangaw.xyz/connect?state=a");
        follow("https://evil.example/connect");
        expect(went).toEqual([]);
    });
});

describe("exportedFile", () => {
    it("loads the page's own file, since the app answers paths without one with the home page", () => {
        expect(exportedFile("/connect?client_id=lilt&state=a")).toBe("/connect.html?client_id=lilt&state=a");
        expect(exportedFile("/connect")).toBe("/connect.html");
        expect(exportedFile("/connect/manual#x")).toBe("/connect/manual.html#x");
    });

    it("leaves the root and files alone", () => {
        expect(exportedFile("/")).toBe("/");
        expect(exportedFile("/connect.html?a=1")).toBe("/connect.html?a=1");
    });
});

describe("currentRoute", () => {
    it("reads /connect.html as /connect, so an open page is not loaded again", () => {
        expect(currentRoute("/connect.html", "?state=a")).toBe("/connect?state=a");
        expect(currentRoute("/connect", "?state=a")).toBe("/connect?state=a");
    });
});
