import { describe, expect, it } from "vitest";

import { getSizedImageUrl } from "./sized-img";

describe("getSizedImageUrl", () => {
    it("routes a Spotify cover through the image endpoint", () => {
        expect(getSizedImageUrl("https://i.scdn.co/image/ab67616d0000b273abc", 64, 64)).toMatch(/\/img\/ab67616d0000b273abc\?s=64x64$/);
    });

    it("fills in an Apple Music artwork template", () => {
        expect(getSizedImageUrl("https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/source/{w}x{h}bb.jpg", 128, 128))
            .toBe("https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/source/128x128bb.jpg");
    });

    it("resizes an Apple Music cover that was already filled in", () => {
        expect(getSizedImageUrl("https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/source/600x600bb.jpg", 96, 96))
            .toBe("https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/source/96x96bb.jpg");
    });

    it("leaves any other image as it is", () => {
        expect(getSizedImageUrl("https://example.com/cover/600x600bb.jpg", 96, 96)).toBe("https://example.com/cover/600x600bb.jpg");
    });

    it("draws nothing for a missing cover", () => {
        expect(getSizedImageUrl(undefined, 64, 64)).toBe("");
        expect(getSizedImageUrl(null, 64, 64)).toBe("");
    });
});
