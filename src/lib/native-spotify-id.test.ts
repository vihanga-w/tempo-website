import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { ACCOUNT_PATTERN, LOGIN_PATTERN } from "./native-spotify-id";

/**
 * These patterns decide when the sign-in webview is on screen, and they are
 * built as strings and interpolated into an injected script - where escaping
 * is easy to get wrong in a way nothing catches. An over-escaped `\\.` is
 * still a valid regex; it just matches a literal backslash and therefore
 * nothing, so the webview would either never hide or never come back.
 */
describe("Spotify page patterns", () => {
    const login = new RegExp(LOGIN_PATTERN, "i");
    const account = new RegExp(ACCOUNT_PATTERN, "i");

    const classify = (url: string) => (login.test(url) ? "login" : account.test(url) ? "account" : "other");

    it("knows a login page whatever region it is served in", () => {
        expect(classify("https://accounts.spotify.com/login")).toBe("login");
        expect(classify("https://accounts.spotify.com/en/login?continue=x")).toBe("login");
        expect(classify("https://accounts.spotify.com/pt-br/login")).toBe("login");
    });

    it("knows an account page whatever region it is served in", () => {
        expect(classify("https://www.spotify.com/account/overview/")).toBe("account");
        expect(classify("https://www.spotify.com/uk/account/profile/")).toBe("account");
        expect(classify("https://www.spotify.com/de/account/overview/")).toBe("account");
    });

    it("leaves everything else alone", () => {
        expect(classify("https://open.spotify.com/")).toBe("other");
        expect(classify("https://developer.spotify.com/dashboard/create")).toBe("other");
    });
});

/**
 * A script is built as a string and evaluated inside a page, so a mistake in it
 * is a runtime error somewhere we cannot see - and a template literal turns
 * `\/` into a bare `/`, which silently began a comment and cost an evening.
 */
describe("injected scripts", () => {
    it("are syntactically valid JavaScript", () => {
        for (const file of ["native-spotify-id.ts", "native-spotify-app-form.ts"]) {
            const source = readFileSync(new URL(file, import.meta.url), "utf8");
            const templates = [...source.matchAll(/return (`(?:[^`\\]|\\.)*`)/g)];

            expect(templates.length).toBeGreaterThan(0);

            for (const [, template] of templates) {
                // eslint-disable-next-line no-eval
                const emitted = eval(template.replace(/\$\{[^}]*\}/g, '"stub"')) as string;

                expect(() => new Function(emitted)).not.toThrow();
            }
        }
    });
});
