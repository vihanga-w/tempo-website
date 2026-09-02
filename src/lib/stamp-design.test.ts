import { describe, it, expect } from "vitest";

import {
    stampCode, stampDate, stampDesign, hashSeed, shiftHue, STAMP_FRAMES,
} from "./stamp-design";

describe("stampCode", () => {
    it("gives three letters, not two", () => {
        // A partial table let every country it left out print a two-letter
        // stamp among three-letter ones. Argentina was the one that got noticed.
        for (const code of ["AR", "NG", "KR", "BR", "GB", "US", "IS", "MQ", "GP", "RE"])
            expect(stampCode(code)).toHaveLength(3);
    });

    it("knows the codes that are not just the alpha-2 plus a letter", () => {
        expect(stampCode("AR")).toBe("ARG");
        expect(stampCode("DE")).toBe("DEU");
        expect(stampCode("GB")).toBe("GBR");
        expect(stampCode("ZA")).toBe("ZAF");
        expect(stampCode("MQ")).toBe("MTQ");
    });

    it("is case insensitive, because callers are", () => {
        expect(stampCode("ar")).toBe(stampCode("AR"));
    });

    it("keeps an unknown code rather than inventing one", () => {
        // Better a two-letter stamp than a third letter belonging to somebody else
        expect(stampCode("ZZ")).toBe("ZZ");
    });
});

describe("stampDate", () => {
    it("prints the day, not just the month", () => {
        expect(stampDate(Date.UTC(2026, 7, 4))).toBe("04 AUG 26");
        expect(stampDate(Date.UTC(2026, 11, 25))).toBe("25 DEC 26");
    });

    it("has nothing to say about a date that is not one", () => {
        expect(stampDate(0)).toBe("");
        expect(stampDate(Number.NaN)).toBe("");
    });
});

describe("stampDesign", () => {
    it("gives a country the same die every time", () => {
        expect(stampDesign("NG", "Nigeria")).toEqual(stampDesign("NG", "Nigeria"));
    });

    it("does not change the die between visits", () => {
        // Seeded on the country and never the date, so a second stamp is the
        // same impression with a new date on it, as a real border post would be
        const design = stampDesign("FR", "France");

        expect(stampDesign("FR", "France")).toEqual(design);
    });

    it("stays inside the frames it has", () => {
        for (const code of ["AR", "NG", "KR", "BR", "GB", "US", "IS", "JP", "SE", "ZA"])
            expect(STAMP_FRAMES).toContain(stampDesign(code, code).frame);
    });

    it("presses the die by hand, not square to the grid", () => {
        for (const code of ["AR", "NG", "KR", "BR", "GB"]) {
            const { rotation } = stampDesign(code, code);

            expect(Math.abs(rotation)).toBeLessThanOrEqual(6);
        }
    });

    it("spreads countries across the frames rather than favouring one", () => {
        const codes = ["AR","NG","KR","BR","GB","US","IS","JP","SE","ZA","FR","DE","NL","IE","CA","AU","JM","ML","GH","CO"];
        const used = new Set(codes.map(c => stampDesign(c, c).frame));

        expect(used.size).toBeGreaterThan(4);
    });
});

describe("hashSeed", () => {
    it("is stable and unsigned", () => {
        expect(hashSeed("NG|Nigeria")).toBe(hashSeed("NG|Nigeria"));
        expect(hashSeed("NG|Nigeria")).toBeGreaterThanOrEqual(0);
    });

    it("separates neighbours", () => {
        expect(hashSeed("FR|France")).not.toBe(hashSeed("FR|Francf"));
    });
});

describe("shiftHue", () => {
    it("returns a colour, shifted", () => {
        const out = shiftHue("#A480FF", 20);

        expect(out).toMatch(/^#[0-9a-f]{6}$/);
        expect(out).not.toBe("#A480FF");
    });

    it("hands back anything it cannot read", () => {
        expect(shiftHue("not a colour", 20)).toBe("not a colour");
    });
});
