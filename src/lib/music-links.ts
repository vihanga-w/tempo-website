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
    /** Opens the song in its service's app, or undefined when there is no song to open. */
    url: string | undefined;
    service: MusicService;
    /** "Spotify", "Apple Music" — for "Open in …". */
    serviceName: string;
}

/**
 * Where to open a song in the app of the service it came from.
 *
 * Takes whatever a payload holds, because a payload can hold nothing: Spotify
 * reports a local file with an id of null, and it is stored and sent that way.
 * That has no link, and is treated as Spotify's, since only Spotify has them.
 * This runs while rendering, where a throw takes the whole page down with it.
 *
 * Only Spotify has episodes; anything but "episode" opens as a track. Apple
 * Music links are https ones: music.apple.com opens the Music app wherever it
 * is installed, and the web player on Android and the web, where a music://
 * link opens nothing.
 */
export function songLink(songId: string | null | undefined, mediaType?: string): SongLink {
    if (typeof songId !== "string" || songId === "")
        return { url: undefined, service: "spotify", serviceName: serviceName("spotify") };

    const track = serviceTrackOf(songId);
    const id = encodeURIComponent(track.id);

    const url = (track.service === "appleMusic"
        ? `https://music.apple.com/us/song/${id}`
        : `spotify://${mediaType === "episode" ? "episode" : "track"}/${id}`);

    return { url, service: track.service, serviceName: serviceName(track.service) };
}

/** Opens a song's link, when it has one. */
export function openSong(link: SongLink) {
    if (link.url)
        window.open(link.url);
}
