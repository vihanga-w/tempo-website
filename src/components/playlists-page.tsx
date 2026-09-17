import { useCallback, useEffect, useRef, useState } from "react";
import { Box, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import { ChevronRight } from "lucide-react";

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

import type User from "@/lib/usrlib";
import { PlaylistNeedsSignInError, describeError, recipeNamed, refreshLine, songCount, type Playlist, type PlaylistSummary } from "@/lib/playlists";
import { feedback, feelPattern } from "@/lib/native-haptics";
import { describeWhen } from "./friend-recent-activity-row";
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
}: Readonly<{
    user: User;
    openCreate?: () => void;
    openProfile?: (userId: string) => void;
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

    return (
        <Box position="fixed" inset="0" background={PAGE_BG} overflowY="auto" overflowX="hidden" sx={{ WebkitOverflowScrolling: "touch" }}>
            <Stack paddingTop={TOP_CLEAR} paddingBottom={BOTTOM_CLEAR} paddingX="24px" gap="0" minHeight="100%">
                {open ? (
                    <OpenPlaylist
                        playlist={open}
                        now={now}
                        busy={busy}
                        note={note}
                        needsSignIn={needsSignIn}
                        onSignIn={() => signInAgain(user)}
                        onBack={back}
                        onRemoveSong={songId => change("remove", () => user.removeFromPlaylist(open.id, songId), () => feedback("tick"))}
                        onRefresh={() => change("refresh", () => user.refreshPlaylist(open.id), () => feedback("open"))}
                        onSend={() => change("spotify", () => user.sendPlaylistToSpotify(open.id), () => feelPattern("reward"))}
                        onDelete={remove}
                        openProfile={openProfile}
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
            {lists.map(list => {
                const recipe = recipeNamed(list.recipe);

                return (
                    <HStack
                        key={list.id}
                        as="button"
                        aria-label={`Open ${list.name}`}
                        onClick={() => onOpen(list.id)}
                        textAlign="left"
                        gap="12px"
                        alignItems="center"
                        padding="14px 16px"
                        borderRadius="16px"
                        background={SURFACE_HI}
                        opacity={opening && opening !== list.id ? 0.6 : 1}
                        transition="opacity .2s"
                        _active={{ opacity: 0.7 }}
                    >
                        <Stack gap="3px" flex="1" minWidth="0">
                            <Text fontFamily="Inter" fontWeight="800" fontSize="18px" letterSpacing="-0.02em" color={INK} noOfLines={1}>
                                {list.name}
                            </Text>
                            <Text fontSize="13px" color={INK_DIM} noOfLines={1}>
                                {recipe.name} · {songCount(list.songCount)} · {describeWhen(list.updatedAt, now)}
                            </Text>
                            {list.spotify && (
                                <Text fontFamily="Inter" fontWeight="600" fontSize="12px" color={ACCENT}>
                                    On your Spotify
                                </Text>
                            )}
                        </Stack>
                        <Box color={INK_FAINT} flexShrink={0}>
                            <ChevronRight size={20} />
                        </Box>
                    </HStack>
                );
            })}
        </Stack>
    );
}

function OpenPlaylist({
    playlist,
    now,
    busy,
    note,
    needsSignIn,
    onSignIn,
    onBack,
    onRemoveSong,
    onRefresh,
    onSend,
    onDelete,
    openProfile,
}: Readonly<{
    playlist: Playlist;
    now: number;
    busy: string | null;
    note: string | null;
    needsSignIn: boolean;
    onSignIn: () => void;
    onBack: () => void;
    onRemoveSong: (songId: string) => void;
    onRefresh: () => void;
    onSend: () => void;
    onDelete: () => void;
    openProfile?: (userId: string) => void;
}>) {
    const recipe = recipeNamed(playlist.recipe);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    return (
        <Stack gap="18px" paddingTop="6px">
            <TextAction label="‹ Playlists" onClick={onBack} tone="dim" />

            <PageWords title={playlist.name}>
                {recipe.blurb} {songCount(playlist.songs.length)}.
            </PageWords>

            <HStack gap="18px" flexWrap="wrap">
                {playlist.spotify ? (
                    <>
                        <TextAction label="Open in Spotify ›" onClick={() => window.open(playlist.spotify!.url)} />
                        <TextAction label={busy === "spotify" ? "Updating…" : "Update on Spotify"} onClick={onSend} disabled={busy !== null} tone="dim" />
                    </>
                ) : (
                    <TextAction label={busy === "spotify" ? "Sending…" : "Send to Spotify ›"} onClick={onSend} disabled={busy !== null} />
                )}
                <TextAction label={busy === "refresh" ? "Refreshing…" : "Refresh"} onClick={onRefresh} disabled={busy !== null} tone="dim" />
            </HStack>

            {note && (
                <Stack gap="8px">
                    <Note>{note}</Note>
                    {needsSignIn && <TextAction label="Sign in again ›" onClick={onSignIn} />}
                </Stack>
            )}

            {playlist.songs.length === 0 ? (
                <Text fontSize="15px" color={INK_DIM} maxWidth="36ch">
                    Nothing fits this recipe right now. Refresh it after some more listening, or make a different one.
                </Text>
            ) : (
                <Stack gap="0" marginX="-4px" paddingX="4px">
                    {playlist.songs.map(song => (
                        <PlaylistSongRow
                            key={song.id}
                            song={song}
                            now={now}
                            onRemove={busy ? undefined : onRemoveSong}
                            openProfile={openProfile}
                        />
                    ))}
                </Stack>
            )}

            <Stack gap="8px" paddingTop="10px">
                {confirmingDelete ? (
                    <HStack gap="18px">
                        <TextAction label={busy === "delete" ? "Deleting…" : "Delete it"} onClick={onDelete} disabled={busy !== null} />
                        <TextAction label="Keep it" onClick={() => setConfirmingDelete(false)} tone="dim" />
                    </HStack>
                ) : (
                    <TextAction label="Delete playlist" onClick={() => setConfirmingDelete(true)} tone="dim" />
                )}
                <Text fontSize="12px" color={INK_FAINT}>
                    {refreshLine(playlist.refreshesAt, now)} A song taken out stays out. Deleting leaves the copy on Spotify, if there is one.
                </Text>
            </Stack>
        </Stack>
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
