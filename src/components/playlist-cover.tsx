import { Box } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { avatarColour, avatarInitial } from "@/lib/avatar-colour";
import { extractArtworkColour, extractArtworkPalette, FALLBACK_ACCENT, PAGE_BG, chipFill, panelFill, readableAccent, rgbToHex, type Rgb } from "@/lib/artwork-colour";
import { getSizedImageUrl } from "@/lib/sized-img";
import { findBestSCDNImageSize } from "@/lib/utils";
import type User from "@/lib/usrlib";
import type { Playlist, PlaylistSong } from "@/lib/playlists";

/**
 * A playlist's cover, drawn in the app exactly as the server draws it for
 * Spotify: the first three covers fanned like a hand of cards on a wash of
 * their colours, the name and running time bottom left, the mark bottom
 * right, and for a playlist made from friends' plays their chips under the
 * words. The same picture in both places, so the playlist is recognisable
 * from either.
 */

const S = 640;
const MARK_SIZE = 88;
const MARK_X = S - MARK_SIZE - 28;
const MARK_Y = S - MARK_SIZE - 28;

export interface CoverFriend {
    id: string;
    name: string;
    picture?: string;
}

/**
 * The people whose plays made a playlist, with their pictures where the
 * listener's friends list has them. Only the friends recipe names anyone.
 */
export function coverFriends(playlist: Pick<Playlist, "recipe" | "songs">, friends: User["friends"] = []): CoverFriend[] {
    if (playlist.recipe !== "friends")
        return [];

    const seen = new Map<string, CoverFriend>();

    for (const song of playlist.songs) {
        if (song.reason.type !== "friend" || seen.has(song.reason.userId))
            continue;

        const userId = song.reason.userId;
        const account = friends.find(f => f.user.id === userId)?.user;
        const images = account?.images ?? [];
        const picture = images.length > 0 ? (findBestSCDNImageSize(images, 96, 96) ?? images[0].url) : undefined;

        seen.set(song.reason.userId, { id: song.reason.userId, name: song.reason.username, picture: picture ?? undefined });
    }

    return [...seen.values()];
}

/** "1h 27m", or "43m", from a total in ms. */
export function runningTime(ms: number): string {
    const minutes = Math.max(0, Math.floor(ms / 60e3));
    const hours = Math.floor(minutes / 60);

    return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export function PlaylistCover({
    name,
    line,
    songs,
    friends = [],
    colours,
    width = "100%",
    id,
}: Readonly<{
    name: string;
    line: string;
    songs: readonly PlaylistSong[];
    friends?: readonly CoverFriend[];
    /** The wash's colours, as hex; the songs' own, or none for the default. */
    colours: readonly string[];
    width?: string;
    /** Distinguishes this cover's gradients and clips from another's on the same page. */
    id: string;
}>) {
    const cards = songs.slice(0, 3);
    const chips = friends.length > 0;
    const size = chips ? 280 : 300;
    const cy = chips ? S / 2 - 84 : S / 2 - 48;
    const spread = cards.length === 1 ? 0 : cards.length === 2 ? 30 : 46;
    const tilt = cards.length === 1 ? 0 : cards.length === 2 ? 9 : 14;
    const [a = FALLBACK_ACCENT, b = "#FF5F8F", c = "#4FE3C1"] = colours;
    const titleY = chips ? S - 122 : S - 66;
    const lineY = chips ? S - 92 : S - 34;
    const r = 21;
    const pitch = 48;
    const slots = Math.max(1, Math.floor((MARK_X - 48 - 2 * r) / pitch) + 1);
    const shown = friends.length <= slots ? friends : friends.slice(0, slots - 1);
    const hidden = friends.length - shown.length;
    const u = (name: string) => `${name}-${id}`;

    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={width} style={{ display: "block", borderRadius: 14, background: PAGE_BG }} role="img" aria-label={`${name} cover`}>
            <defs>
                <radialGradient id={u("wa")} cx="0.2" cy="0.15" r="0.8"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={a} stopOpacity="0" /></radialGradient>
                <radialGradient id={u("wb")} cx="0.85" cy="0.35" r="0.7"><stop offset="0" stopColor={b} /><stop offset="1" stopColor={b} stopOpacity="0" /></radialGradient>
                <radialGradient id={u("wc")} cx="0.5" cy="0.95" r="0.7"><stop offset="0" stopColor={c} /><stop offset="1" stopColor={c} stopOpacity="0" /></radialGradient>
                <linearGradient id={u("fade")} x1="0" y1="0" x2="0" y2="1"><stop offset="0.5" stopColor={PAGE_BG} stopOpacity="0" /><stop offset="1" stopColor={PAGE_BG} stopOpacity="0.9" /></linearGradient>
                <clipPath id={u("plate")}><rect x={MARK_X} y={MARK_Y} width={MARK_SIZE} height={MARK_SIZE} rx="20" /></clipPath>
                {cards.map((_, i) => <clipPath key={i} id={u(`card${i}`)}><rect width={size} height={size} rx="14" /></clipPath>)}
                {shown.map((f, i) => f.picture && <clipPath key={f.id} id={u(`chip${i}`)}><circle cx={32 + r + i * pitch} cy={S - 48} r={r} /></clipPath>)}
            </defs>
            <rect width={S} height={S} fill={PAGE_BG} />
            <rect width={S} height={S} fill={`url(#${u("wa")})`} opacity="0.3" />
            <rect width={S} height={S} fill={`url(#${u("wb")})`} opacity="0.25" />
            <rect width={S} height={S} fill={`url(#${u("wc")})`} opacity="0.3" />
            <rect width={S} height={S} fill={`url(#${u("fade")})`} />
            {/* Drawn back to front, so the first song's cover is the one in front */}
            {[...cards.entries()].reverse().map(([i, song]) => {
                const offset = i - (cards.length - 1) / 2;

                return (
                    <g key={song.id} transform={`translate(${S / 2 + offset * spread} ${cy}) rotate(${offset * tilt}) translate(${-size / 2} ${-size / 2})`}>
                        <rect x="-6" y="-6" width={size + 12} height={size + 12} rx="18" fill={PAGE_BG} opacity="0.7" />
                        <image href={getSizedImageUrl(song.imageUrl, 320, 320)} width={size} height={size} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${u(`card${i}`)})`} />
                    </g>
                );
            })}
            <text x="32" y={titleY} fill="#fff" fontFamily="Inter" fontWeight="800" fontSize="40" letterSpacing="-1.2">{name}</text>
            <text x="32" y={lineY} fill="#fff" opacity="0.62" fontFamily="Inter" fontWeight="500" fontSize="19">{line}</text>
            {shown.map((f, i) => {
                const cx = 32 + r + i * pitch;
                const colour = avatarColour(f.id);

                return f.picture ? (
                    <g key={f.id}>
                        <image href={f.picture} x={cx - r} y={S - 48 - r} width={2 * r} height={2 * r} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${u(`chip${i}`)})`} />
                        <circle cx={cx} cy={S - 48} r={r} fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.5" />
                    </g>
                ) : (
                    <g key={f.id}>
                        <circle cx={cx} cy={S - 48} r={r} fill={colour.from} />
                        <text x={cx} y={S - 41} textAnchor="middle" fill={colour.ink} fontFamily="Inter" fontWeight="800" fontSize="20">{avatarInitial(f.name)}</text>
                    </g>
                );
            })}
            {hidden > 0 && (
                <g>
                    <circle cx={32 + r + shown.length * pitch} cy={S - 48} r={r} fill="#fff" fillOpacity="0.16" />
                    <text x={32 + r + shown.length * pitch} y={S - 42} textAnchor="middle" fill="#fff" fontFamily="Inter" fontWeight="800" fontSize="16">+{hidden}</text>
                </g>
            )}
            <image href="/icon.png" x={MARK_X} y={MARK_Y} width={MARK_SIZE} height={MARK_SIZE} clipPath={`url(#${u("plate")})`} />
        </svg>
    );
}

/**
 * The fan alone, small: a playlist's first three covers as the list shows
 * them, with no words, since at this size the words are the row's.
 */
export function FanThumb({ artwork, id, size = "84px" }: Readonly<{ artwork: readonly string[]; id: string; size?: string }>) {
    const cards = artwork.slice(0, 3);
    const card = cards.length === 1 ? 420 : 380;
    const spread = cards.length === 1 ? 0 : cards.length === 2 ? 44 : 64;
    const tilt = cards.length === 1 ? 0 : cards.length === 2 ? 9 : 14;
    const u = (name: string) => `${name}-thumb-${id}`;

    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={size} height={size} style={{ display: "block", borderRadius: 12, background: "#1c1b20", flexShrink: 0 }} aria-hidden>
            <defs>
                {cards.map((_, i) => <clipPath key={i} id={u(`card${i}`)}><rect width={card} height={card} rx="22" /></clipPath>)}
            </defs>
            {cards.length === 0 && <image href="/icon.png" x={S / 2 - 120} y={S / 2 - 120} width="240" height="240" opacity="0.9" />}
            {[...cards.entries()].reverse().map(([i, src]) => {
                const offset = i - (cards.length - 1) / 2;

                return (
                    <g key={i} transform={`translate(${S / 2 + offset * spread} ${S / 2}) rotate(${offset * tilt}) translate(${-card / 2} ${-card / 2})`}>
                        <rect x="-8" y="-8" width={card + 16} height={card + 16} rx="28" fill={PAGE_BG} opacity="0.7" />
                        <image href={getSizedImageUrl(src, 160, 160)} width={card} height={card} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${u(`card${i}`)})`} />
                    </g>
                );
            })}
        </svg>
    );
}

/* ------------------------------------------------------------------ colour */

export interface PlaylistColour {
    /** The dominant colour of the first cover, or null with no cover to read. */
    tint: Rgb | null;
    /** The wash's colours: the palette off the first cover. */
    palette: string[];
    /** Ink that reads on the page and carries the cover's hue: for reasons and links. */
    accentInk: string;
    /** A flat surface the colour of the record, for the actions bar. */
    panel: string;
    /** A small tinted surface, for a pill on the wash. */
    chip: string;
}

const NEUTRAL: PlaylistColour = { tint: null, palette: [], accentInk: FALLBACK_ACCENT, panel: "#1c1b20", chip: "#2a2930" };

const cache = new Map<string, Promise<PlaylistColour>>();

/**
 * A playlist's colour, read once off its first cover and kept for the
 * session, so opening the same playlist again costs nothing and the page
 * never re-reads a cover on scroll.
 */
export function readPlaylistColour(src: string): Promise<PlaylistColour> {
    let cached = cache.get(src);

    if (!cached) {
        cached = Promise.all([extractArtworkColour(src), extractArtworkPalette(src)])
            .then(([tint, palette]) => (tint
                ? { tint, palette, accentInk: readableAccent(tint), panel: panelFill(tint), chip: chipFill(tint) }
                : NEUTRAL))
            .catch(() => NEUTRAL);

        cache.set(src, cached);
    }

    return cached;
}

/** The colour of a playlist as it becomes known; neutral until then, and neutral for a playlist with no cover. */
export function usePlaylistColour(src: string | undefined): PlaylistColour {
    const [colour, setColour] = useState<PlaylistColour>(NEUTRAL);

    useEffect(() => {
        if (!src) {
            setColour(NEUTRAL);

            return;
        }

        let cancelled = false;

        readPlaylistColour(src).then(found => {
            if (!cancelled)
                setColour(found);
        });

        return () => { cancelled = true; };
    }, [src]);

    return colour;
}

/** The page's tint as hex, for the shell and for glass to reflect. */
export function tintHex(colour: PlaylistColour): string {
    return colour.tint ? rgbToHex(colour.tint) : FALLBACK_ACCENT;
}

/** A round chip: a friend's picture, or their initial in their colour. */
export function FriendChip({ friend, size = 22 }: Readonly<{ friend: CoverFriend; size?: number }>) {
    const colour = avatarColour(friend.id);

    return friend.picture ? (
        <Box as="img" src={friend.picture} alt="" width={`${size}px`} height={`${size}px`} borderRadius="full" objectFit="cover" flexShrink={0} boxShadow="0 0 0 1px rgba(255,255,255,0.18)" />
    ) : (
        <Box width={`${size}px`} height={`${size}px`} borderRadius="full" background={colour.from} color={colour.ink} fontFamily="Inter" fontWeight="800" fontSize={`${Math.round(size * 0.5)}px`} display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
            {avatarInitial(friend.name)}
        </Box>
    );
}
