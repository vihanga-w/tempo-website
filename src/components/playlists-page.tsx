import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, HStack, Skeleton, Stack, Text, type BoxProps } from "@chakra-ui/react";
import { ChevronRight } from "lucide-react";

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

import type User from "@/lib/usrlib";
import { PlaylistNeedsSignInError, describeError, recipeNamed, refreshLine, songCount, type Playlist, type PlaylistSummary } from "@/lib/playlists";
import { feedback, feelPattern } from "@/lib/native-haptics";
import { describeWhen } from "./friend-recent-activity-row";
import { ArtworkWash } from "./artwork-wash";
import { FanThumb, PlaylistCover, coverFriends, runningTime, tintHex, usePlaylistColour, type CoverFriend } from "./playlist-cover";
import { GLASS_TRANSITION, glassPress, glassSurface } from "@/lib/liquid-glass";
import { getSizedImageUrl } from "@/lib/sized-img";
import { getSpotifyPlaylistDeeplink } from "./playback-state";
import {
    ACCENT, BOTTOM_CLEAR, INK, INK_DIM, INK_FAINT, Note, PAGE_BG, PageWords, PlaylistSongRow, SURFACE_HI, SectionLabel, TOP_CLEAR, TextAction,
} from "./playlist-song-row";

/**
 * The way back through sign-in, for a Spotify permission this account has
 * not granted. As the release notice does it: sign out and reload, and the
 * sign-in that runs on the next load already handles this platform — the
 * native sheet, or the web redirect — rather than a second path to keep
 * working. The web page /reauth would have taken the native web view itself
 * through Spotify, and left it on the website.
 */
async function signInAgain(user: User) {
    try {
        await user.logout();
    } catch (ex) {
        console.warn("Could not sign out before re-authorising:", ex);
    }

    try {
        if (Capacitor.isNativePlatform())
            await Preferences.remove({ key: "tempo.s.a" });
    } catch { }

    window.location.reload();
}

/**
 * Playlists: the ones Tempo has made for this listener, and what is in them.
 *
 * Two views on one page. The list, and a playlist opened from it with every
 * song's reason under its name — which is what a Tempo playlist has that a
 * Spotify one does not. Everything done to a playlist is done here: a song
 * taken out (and kept out), a refresh from its recipe, a copy sent to
 * Spotify and kept in step, and deletion. Making a new one is its own page,
 * reached from the pinned action.
 *
 * Sending to Spotify can fail for a reason a retry will not fix: the account
 * was authorised before Tempo asked for the permission. The server says so,
 * and the page says it in words rather than as an error.
 */
export default function PlaylistsPage({
    user,
    openCreate,
    openProfile,
    onPaletteChange,
    setComplementaryColour,
    lendBack,
}: Readonly<{
    user: User;
    openCreate?: () => void;
    openProfile?: (userId: string) => void;
    /** The shell's floating controls take the open playlist's colour. */
    onPaletteChange?: (colours: string[] | null) => void;
    setComplementaryColour?: (colour: string) => void;
    /** Lends the shell's menu button a way back while a playlist is open, and takes it back after. */
    lendBack?: (back: (() => void) | null) => void;
}>) {
    const [lists, setLists] = useState<PlaylistSummary[] | null>(null);
    /** Whether the list could not be read at all, which is not the same as there being none. */
    const [unread, setUnread] = useState(false);
    const [open, setOpen] = useState<Playlist | null>(null);
    const [opening, setOpening] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    /** The last refusal was for a Spotify permission only a sign-in can grant. */
    const [needsSignIn, setNeedsSignIn] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    /**
     * Which playlist the page is on, or null for the list, as of the last
     * tap: so an answer that arrives after the reader has moved on — a slow
     * refresh after they went back, the first of two quick taps on the list —
     * is dropped rather than put in front of them.
     */
    const wanted = useRef<string | null>(null);

    const load = useCallback(async () => {
        setUnread(false);
        setNote(null);

        try {
            setLists(await user.getPlaylists());
            setNow(Date.now());
        } catch (ex) {
            console.warn("Could not read playlists:", ex);
            setLists(null);
            setUnread(true);
            setNote(describeError(ex, "Could not read your playlists."));
        }
    }, [user]);

    useEffect(() => {
        load();
    }, [load]);

    const show = useCallback(async (id: string) => {
        wanted.current = id;
        setOpening(id);
        setNote(null);

        try {
            const playlist = await user.getPlaylist(id);

            if (wanted.current !== id)
                return;

            setOpen(playlist);
            setNow(Date.now());
        } catch (ex) {
            if (wanted.current === id)
                setNote(describeError(ex, "Could not open that playlist."));
        } finally {
            if (wanted.current === id)
                setOpening(null);
        }
    }, [user]);

    const back = useCallback(() => {
        wanted.current = null;
        setOpen(null);
        setOpening(null);
        setNote(null);
        setNeedsSignIn(false);
    }, []);

    // While a playlist is open the menu button is the way back, as on a sub-page
    useEffect(() => {
        if (!lendBack)
            return;

        lendBack(open ? back : null);

        return () => lendBack(null);
    }, [open, back, lendBack]);

    /** Runs one change to the open playlist, keeping the list in step. */
    const change = useCallback(async (what: string, run: () => Promise<Playlist>, feel?: () => void) => {
        setBusy(what);
        setNote(null);
        setNeedsSignIn(false);

        try {
            const changed = await run();

            // The list is kept right either way; the page only if they are still on it
            setLists(current => (current ?? []).map(v => (v.id === changed.id
                ? { ...v, name: changed.name, updatedAt: changed.updatedAt, songCount: changed.songs.length, spotify: changed.spotify }
                : v)));

            if (wanted.current !== changed.id)
                return;

            feel?.();
            setOpen(changed);
            setNow(Date.now());
        } catch (ex) {
            if (wanted.current === null)
                return;

            setNeedsSignIn(ex instanceof PlaylistNeedsSignInError);
            setNote(describeError(ex, "That did not work. Try again in a moment."));
        } finally {
            setBusy(null);
        }
    }, []);

    const remove = useCallback(async () => {
        if (!open)
            return;

        setBusy("delete");
        setNote(null);

        try {
            await user.deletePlaylist(open.id);
            feelPattern("undone");
            setLists(current => (current ?? []).filter(v => v.id !== open.id));

            if (wanted.current === open.id)
                back();
        } catch (ex) {
            if (wanted.current === open.id)
                setNote(describeError(ex, "Could not delete that playlist."));
        } finally {
            setBusy(null);
        }
    }, [open, user]);

    // The people behind the open playlist, with their pictures from the friends list
    const openFriends = useMemo(() => (open ? coverFriends(open, user.friends ?? []) : []), [open, user.friends]);

    return (
        <Box position="fixed" inset="0" background={PAGE_BG} overflowY="auto" overflowX="hidden" sx={{ WebkitOverflowScrolling: "touch" }}>
            <Stack paddingTop={TOP_CLEAR} paddingBottom={BOTTOM_CLEAR} paddingX="24px" gap="0" minHeight="100%">
                {open ? (
                    <OpenPlaylist
                        playlist={open}
                        friends={openFriends}
                        listener={user.object?.displayName}
                        now={now}
                        busy={busy}
                        note={note}
                        needsSignIn={needsSignIn}
                        onSignIn={() => signInAgain(user)}
                        onRemoveSong={songId => change("remove", () => user.removeFromPlaylist(open.id, songId), () => feedback("tick"))}
                        onSend={() => change("spotify", () => user.sendPlaylistToSpotify(open.id), () => feelPattern("reward"))}
                        onDelete={remove}
                        openProfile={openProfile}
                        onPaletteChange={onPaletteChange}
                        setComplementaryColour={setComplementaryColour}
                    />
                ) : (
                    <PlaylistList lists={lists} unread={unread} now={now} opening={opening} note={note} onOpen={show} onRetry={load} openCreate={openCreate} />
                )}
            </Stack>
        </Box>
    );
}

function PlaylistList({
    lists,
    unread,
    now,
    opening,
    note,
    onOpen,
    onRetry,
    openCreate,
}: Readonly<{
    lists: PlaylistSummary[] | null;
    unread: boolean;
    now: number;
    opening: string | null;
    note: string | null;
    onOpen: (id: string) => void;
    onRetry: () => void;
    openCreate?: () => void;
}>) {
    // Could not ask, which is not the same as there being nothing there
    if (unread)
        return (
            <Stack flex="1" justifyContent="center" gap="10px">
                <PageWords title="Could not read your playlists">
                    {note ?? "Something went wrong asking for them."}
                </PageWords>
                <TextAction label="Try again ›" onClick={onRetry} />
            </Stack>
        );

    if (lists === null)
        return <LoadingRows label="Loading playlists" />;

    if (lists.length === 0)
        return (
            <Stack flex="1" justifyContent="center" gap="10px">
                <PageWords title="No playlists yet">
                    Tempo makes playlists from what only it knows: what you liked in Discover, what your friends had on repeat, and the songs you keep coming back to.
                </PageWords>
                {openCreate && <TextAction label="Make one ›" onClick={openCreate} />}
                {note && <Note>{note}</Note>}
            </Stack>
        );

    return (
        <Stack gap="10px" paddingTop="6px">
            <SectionLabel>Your playlists</SectionLabel>
            {note && <Note>{note}</Note>}
            {lists.map(list => (
                <PlaylistRow key={list.id} list={list} now={now} dimmed={opening !== null && opening !== list.id} onOpen={onOpen} />
            ))}
        </Stack>
    );
}

/**
 * One playlist in the list: its fan, small, with its name, what it is made
 * of, how long it runs and where it lives. Bare on the page, as the song
 * rows are; only its Spotify line carries its own colour, the one its page
 * will open in.
 */
function PlaylistRow({
    list,
    now,
    dimmed,
    onOpen,
}: Readonly<{ list: PlaylistSummary; now: number; dimmed: boolean; onOpen: (id: string) => void }>) {
    const recipe = recipeNamed(list.recipe);
    const artwork = list.artwork ?? [];
    const colour = usePlaylistColour(artwork[0] ? getSizedImageUrl(artwork[0], 300, 300) : undefined);
    const runs = list.durationMs ? ` · ${runningTime(list.durationMs)}` : "";
    // A playlist named after its recipe does not need the recipe said twice
    const madeOf = list.name.trim().toLowerCase() === recipe.name.toLowerCase() ? "" : `${recipe.name} · `;

    return (
        <HStack
            as="button"
            aria-label={`Open ${list.name}`}
            onClick={() => { feedback("press"); onOpen(list.id); }}
            textAlign="left"
            gap="14px"
            alignItems="center"
            paddingY="8px"
            opacity={dimmed ? 0.6 : 1}
            transition="opacity .2s"
            _active={{ opacity: 0.7 }}
        >
            <FanThumb artwork={artwork} id={list.id} />
            <Stack gap="3px" flex="1" minWidth="0">
                <Text fontFamily="Inter" fontWeight="800" fontSize="17px" letterSpacing="-0.02em" lineHeight="1.15" color={INK} noOfLines={2}>
                    {list.name}
                </Text>
                <Text fontSize="13px" color={INK_DIM} noOfLines={1}>
                    {madeOf}{songCount(list.songCount)}{runs}
                </Text>
                <Text fontFamily="Inter" fontWeight="600" fontSize="12px" color={colour.accentInk} noOfLines={1}>
                    {list.spotify ? "Saved in Spotify" : "Not on Spotify yet"} · {describeWhen(list.updatedAt, now)}
                </Text>
            </Stack>
            <Box color={INK_FAINT} flexShrink={0}>
                <ChevronRight size={20} />
            </Box>
        </HStack>
    );
}

function OpenPlaylist({
    playlist,
    friends,
    listener,
    now,
    busy,
    note,
    needsSignIn,
    onSignIn,
    onRemoveSong,
    onSend,
    onDelete,
    openProfile,
    onPaletteChange,
    setComplementaryColour,
}: Readonly<{
    playlist: Playlist;
    friends: readonly CoverFriend[];
    /** Whose playlist it is, for the cover's "for Vihanga". */
    listener?: string;
    now: number;
    busy: string | null;
    note: string | null;
    needsSignIn: boolean;
    onSignIn: () => void;
    onRemoveSong: (songId: string) => void;
    onSend: () => void;
    onDelete: () => void;
    openProfile?: (userId: string) => void;
    onPaletteChange?: (colours: string[] | null) => void;
    setComplementaryColour?: (colour: string) => void;
}>) {
    const recipe = recipeNamed(playlist.recipe);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const first = playlist.songs[0]?.imageUrl;
    const colour = usePlaylistColour(first ? getSizedImageUrl(first, 300, 300) : undefined);
    const tint = tintHex(colour);
    const timed = playlist.songs.some(s => s.duration);
    const runs = runningTime(playlist.songs.reduce((sum, song) => sum + (song.duration ?? 0), 0));
    const line = `${recipe.name} · ${songCount(playlist.songs.length)}${timed ? ` · ${runs}` : ""}`;
    // The cover's own line, as the server writes it on the Spotify copy
    const coverLine = [listener?.trim() ? `for ${listener.trim()}` : "", timed ? runs : ""].filter(Boolean).join(" · ");

    // The floating controls and the title take the playlist's colour while it is open, as on a profile
    useEffect(() => {
        onPaletteChange?.(colour.tint ? [colour.accentInk, tint] : null);
        setComplementaryColour?.(colour.tint ? colour.accentInk : "#e9e7fb");

        return () => {
            onPaletteChange?.(null);
            setComplementaryColour?.("#e9e7fb");
        };
    }, [colour, tint, onPaletteChange, setComplementaryColour]);

    const pill = glassSurface({ tier: "regular", tint });

    return (
        <Stack gap="0" marginX="-24px" marginTop={`calc(-1 * ${TOP_CLEAR})`} position="relative">
            {/* The wash: the first cover as a light source behind the hero. Nothing with glass sits inside it. */}
            {first && colour.palette.length > 0 && (
                <Box position="absolute" top="0" left="0" right="0" height="520px" pointerEvents="none" aria-hidden>
                    <ArtworkWash src={getSizedImageUrl(first, 300, 300)} palette={colour.palette} detail="quiet" />
                </Box>
            )}

            <Stack gap="18px" paddingTop={`calc(${TOP_CLEAR} + 8px)`} paddingX="24px" position="relative">
                {/* The hero: the same cover the playlist has on Spotify */}
                <Box width="min(72%, 260px)" alignSelf="center" boxShadow="0 30px 60px -24px rgba(0,0,0,0.85)" borderRadius="14px">
                    <PlaylistCover
                        id={playlist.id}
                        name={playlist.name}
                        line={coverLine}
                        songs={playlist.songs}
                        friends={friends}
                        colours={colour.palette}
                    />
                </Box>

                <Stack gap="4px" alignItems="center" textAlign="center">
                    <Text fontFamily="Inter" fontWeight="800" fontSize="26px" letterSpacing="-0.025em" lineHeight="1.1" color={INK}>
                        {playlist.name}
                    </Text>
                    <Text fontSize="14px" color={INK_DIM}>{line}</Text>
                    <Text fontFamily="Inter" fontWeight="600" fontSize="12px" color={colour.accentInk} opacity="0.9">
                        {playlist.spotify ? "Saved in Spotify · " : ""}{refreshLine(playlist.refreshesAt, playlist.recipe, now).replace(/\.$/, "")}
                    </Text>
                </Stack>

                {/*
                  * The one thing people do with a playlist, as small glass,
                  * which flips its tone with the wash behind it. Sending to
                  * Spotify happens as a playlist is made and refreshing
                  * happens on its recipe's own clock — weekly, or with the
                  * hour — so neither needs a button. Nothing else
                  * sits beside the glass: content that moved next to it left
                  * WebKit's blur painting a stale strip on the pill.
                  */}
                {playlist.spotify && (
                    <HStack justifyContent="center">
                        <Pill
                            glass={pill}
                            label="Play in Spotify"
                            primary
                            accent={colour.accentInk}
                            onClick={() => window.open(getSpotifyPlaylistDeeplink(playlist.spotify!.id))}
                        />
                    </HStack>
                )}

                {note && (
                    <Stack gap="8px" alignItems="center">
                        <Note>{note}</Note>
                        {needsSignIn && <TextAction label="Sign in again ›" onClick={onSignIn} />}
                    </Stack>
                )}

                {playlist.songs.length === 0 ? (
                    <Text fontSize="15px" color={INK_DIM} maxWidth="36ch" alignSelf="center" textAlign="center">
                        Nothing fits this recipe right now. Refresh it after some more listening, or make a different one.
                    </Text>
                ) : (
                    <Stack gap="0" marginX="-4px" paddingX="4px" paddingTop="6px">
                        {playlist.songs.map(song => (
                            <PlaylistSongRow
                                key={song.id}
                                song={song}
                                now={now}
                                onRemove={busy ? undefined : onRemoveSong}
                                openProfile={openProfile}
                                accent={colour.accentInk}
                                friends={friends}
                            />
                        ))}
                    </Stack>
                )}

                {/* The rare things, at the foot: a send that did not happen when it was made, and deletion, which asks first */}
                <Stack gap="8px" paddingTop="10px">
                    <HStack gap="18px" flexWrap="wrap">
                        {!playlist.spotify && <TextAction label={busy === "spotify" ? "Sending…" : "Send to Spotify ›"} onClick={onSend} disabled={busy !== null} />}
                        {confirmingDelete ? (
                            <>
                                <TextAction label={busy === "delete" ? "Deleting…" : "Delete it"} onClick={onDelete} disabled={busy !== null} />
                                <TextAction label="Keep it" onClick={() => setConfirmingDelete(false)} tone="dim" />
                            </>
                        ) : (
                            <TextAction label="Delete playlist" onClick={() => setConfirmingDelete(true)} tone="dim" />
                        )}
                    </HStack>
                    <Text fontSize="12px" color={INK_FAINT}>
                        A song taken out stays out. Deleting removes it from your Spotify too.
                    </Text>
                </Stack>
            </Stack>
        </Stack>
    );
}

/** A small glass pill: the primary one carries the playlist's ink, the rest read in white. */
function Pill({
    glass,
    label,
    onClick,
    disabled,
    primary,
    accent,
}: Readonly<{ glass: BoxProps; label: string; onClick: () => void; disabled?: boolean; primary?: boolean; accent?: string }>) {
    return (
        <Box
            as="button"
            {...glass}
            disabled={disabled}
            onClick={() => { feedback("press"); onClick(); }}
            height="42px"
            paddingX={primary ? "20px" : "16px"}
            fontFamily="Inter"
            fontWeight="700"
            fontSize="14px"
            color={primary ? accent : INK}
            opacity={disabled ? 0.5 : 1}
            transition={`opacity .2s, transform .12s, ${GLASS_TRANSITION}`}
            _active={glassPress}
            style={{ ...glass.style, WebkitTouchCallout: "none", userSelect: "none" }}
        >
            {label}
        </Box>
    );
}

function LoadingRows({ label }: Readonly<{ label: string }>) {
    return (
        <Stack gap="10px" paddingTop="6px" aria-label={label}>
            <Skeleton height="14px" width="34%" borderRadius="6px" startColor={SURFACE_HI} endColor="#26252b" />
            {[0, 1, 2].map(i => (
                <Skeleton key={i} height="82px" borderRadius="16px" startColor={SURFACE_HI} endColor="#26252b" />
            ))}
        </Stack>
    );
}
