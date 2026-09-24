import { describe, expect, it } from "vitest";

import { serviceTrackOf, songLink } from "./music-links";

describe("serviceTrackOf", () => {
    it("reads an unprefixed id as Spotify", () => {
        expect(serviceTrackOf("4uLU6hMCjMI75M1A2tKUQC")).toEqual({ service: "spotify", id: "4uLU6hMCjMI75M1A2tKUQC" });
    });

    it("reads a prefixed id as Apple Music", () => {
        expect(serviceTrackOf("am:1440833098")).toEqual({ service: "appleMusic", id: "1440833098" });
    });
});

describe("songLink", () => {
    it("opens a Spotify track in Spotify", () => {
        expect(songLink("sp1")).toEqual({ url: "spotify://track/sp1", service: "spotify", serviceName: "Spotify" });
    });

    it("opens a Spotify episode as an episode", () => {
        expect(songLink("ep1", "episode").url).toBe("spotify://episode/ep1");
    });

    it("opens an Apple Music song in Apple Music", () => {
        expect(songLink("am:123")).toEqual({
            url: "music://music.apple.com/us/song/123",
            service: "appleMusic",
            serviceName: "Apple Music",
        });
    });

    it("cannot be steered off the song by what is in the id", () => {
        expect(songLink("a/../b").url).toBe("spotify://track/a%2F..%2Fb");
    });
});
