/**
 * The words the profile page puts on screen.
 *
 * Kept apart from the page because copy is the part of it with right and wrong
 * answers — a name that comes out as a headphone, a caption that reads back a
 * figure the reader just looked at — and those are worth holding still with
 * tests rather than re-reading every time the page changes.
 */

import { formatListening } from "@/lib/utils";

/**
 * The name to put at the top of somebody's profile.
 *
 * The account name is whatever Spotify holds, which for most people is their
 * full name, and a full name at the top of your own profile reads as a record of
 * you rather than as you. The first word of it is the one somebody would
 * actually be called, and it fits on one line at a size worth setting it at —
 * "Vihanga Weerasinghe" wrapped to two and had to be set small to do it.
 *
 * A name with no space in it is already the short form and is left alone.
 */
export function shortName(displayName?: string): string {
    const trimmed = (displayName ?? "").trim();

    if (trimmed === "")
        return "";

    // Any run of whitespace, so a name typed with two spaces or with a
    // non-breaking one between the parts still comes back as a single word
    const words = trimmed.split(/\s+/);

    // Skip a leading decoration. Plenty of music accounts are called things like
    // "🎧 dj nights", and the first word of that is not a name — it is a
    // headphone, which is not what anybody wants at the top of their profile
    return (words.find(word => /[\p{L}\p{N}]/u.test(word)) ?? trimmed);
}

/**
 * Something to say about the week that the tiles above it do not already say.
 *
 * Every branch of this used to read back a figure the reader had just looked at
 * — "mostly in one sitting" restated the longest streak tile word for word, and
 * the rest restated the song count. A caption that repeats the thing it sits
 * under is worse than no caption, because it costs a line and a read to learn
 * nothing.
 *
 * So it works out the daily average instead, which is the one thing about the
 * week none of the three tiles can show, and carries the voice on top of that.
 */
export function weekLine(
    stats: { totalListeningDuration: number; uniqueSongsPlayedCount: number; longestStreak: number },
    isOwnProfile: boolean,
): string {
    if (stats.totalListeningDuration <= 0)
        return (isOwnProfile ? "Press play and this starts filling in." : "Nothing played in the past week.");

    const hours = stats.totalListeningDuration / 3600e3;
    const perDay = formatListening(Math.round(stats.totalListeningDuration / 7));

    if (hours >= 20)
        return `That is about ${perDay} every day. ${isOwnProfile ? "Your" : "Their"} headphones have earned a rest.`;

    if (hours >= 10)
        return `About ${perDay} every day.`;

    return `About ${perDay} a day across the week.`;
}
