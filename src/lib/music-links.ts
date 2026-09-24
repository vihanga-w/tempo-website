/**
 * Where to open a song, and what to call the place.
 *
 * A song's id is its Spotify track id unless it was first heard somewhere
 * else, in which case it carries that service in a prefix ("am:" and an Apple
 * Music catalog id). The server keeps the same rule in song-identity.ts, along
 * with every other service a song is known to be on — ask GET /songs/:id/links
 * for those. This only reads the id, so it opens a song where it came from.
 */

export type MusicService = "spotify" | "appleMusic";

const APPLE_MUSIC_PREFIX = "am:";

const SERVICE_NAMES: Record<MusicService, string> = {
    spotify: "Spotify",
    appleMusic: "Apple Music",
};

export function serviceName(service: MusicService) {
    return SERVICE_NAMES[service];
}

/** The service a song id comes from, and the song's id there. */
export function serviceTrackOf(songId: string): { service: MusicService; id: string } {
    if (songId.startsWith(APPLE_MUSIC_PREFIX))
        return { service: "appleMusic", id: songId.slice(APPLE_MUSIC_PREFIX.length) };

    return { service: "spotify", id: songId };
}

export interface SongLink {
    /** Opens the song in its service's app. */
    url: string;
    service: MusicService;
    /** "Spotify", "Apple Music" — for "Open in …". */
    serviceName: string;
}

/**
 * Where to open a song in the app of the service it came from.
 *
 * Only Spotify has episodes. Apple Music links name a storefront, and any
 * storefront's link opens in the listener's own.
 */
export function songLink(songId: string, type: "track" | "episode" = "track"): SongLink {
    const track = serviceTrackOf(songId);

    const url = (track.service === "appleMusic"
        ? `music://music.apple.com/us/song/${encodeURIComponent(track.id)}`
        : `spotify://${type}/${encodeURIComponent(track.id)}`);

    return { url, service: track.service, serviceName: serviceName(track.service) };
}
