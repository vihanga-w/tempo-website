import { describe, expect, it } from "vitest";

import { inAppPath } from "./app-links";

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
