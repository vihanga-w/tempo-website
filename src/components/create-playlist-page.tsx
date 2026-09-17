import { useCallback, useEffect, useState } from "react";
import { Box, HStack, Input, Skeleton, Stack, Text } from "@chakra-ui/react";
import { ChevronRight } from "lucide-react";

import type User from "@/lib/usrlib";
import { RECIPES, describeError, recipeNamed, songCount, type PlaylistRecipe, type PlaylistSong } from "@/lib/playlists";
import { feedback, feelPattern } from "@/lib/native-haptics";
import {
    ACCENT, BOTTOM_CLEAR, INK, INK_DIM, INK_FAINT, Note, PAGE_BG, PageWords, PlaylistSongRow, PrimaryButton, SURFACE_HI, SectionLabel,
    TOP_CLEAR, TextAction,
} from "./playlist-song-row";

/**
 * New Playlist: pick a recipe, see what it makes, name it, keep it.
 *
 * The preview comes first, before a name is asked for: a recipe that finds
 * nothing right now should say so before anybody types anything, and a
 * playlist is easier to name once its songs are in view. What is shown is
 * exactly what will be kept — the server builds it the same way both times.
 */
export default function CreatePlaylistPage({
    user,
    onCreated,
}: Readonly<{
    user: User;
    /** Called with the new playlist's id once it has been kept. */
    onCreated?: (id: string) => void;
}>) {
    const [recipe, setRecipe] = useState<PlaylistRecipe | null>(null);
    const [preview, setPreview] = useState<PlaylistSong[] | null>(null);
    const [name, setName] = useState("");
    const [making, setMaking] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!recipe)
            return;

        let cancelled = false;

        setPreview(null);
        setNote(null);
        setName(recipeNamed(recipe).name);

        user.previewPlaylist(recipe)
            .then(songs => {
                if (cancelled)
                    return;

                setPreview(songs);
                setNow(Date.now());
            })
            .catch(ex => {
                if (cancelled)
                    return;

                setPreview([]);
                setNote(describeError(ex, "Could not build that playlist."));
            });

        return () => { cancelled = true; };
    }, [recipe, user]);

    const make = useCallback(async () => {
        if (!recipe || making)
            return;

        setMaking(true);
        setNote(null);

        try {
            const made = await user.createPlaylist(recipe, name);

            feelPattern("reward");
            onCreated?.(made.id);
        } catch (ex) {
            setNote(describeError(ex, "Could not make that playlist."));
            setMaking(false);
        }
    }, [making, name, onCreated, recipe, user]);

    return (
        <Box position="fixed" inset="0" background={PAGE_BG} overflowY="auto" overflowX="hidden" sx={{ WebkitOverflowScrolling: "touch" }}>
            <Stack paddingTop={TOP_CLEAR} paddingBottom={BOTTOM_CLEAR} paddingX="24px" gap="18px" minHeight="100%">
                {recipe === null ? (
                    <>
                        <PageWords title="What should it be made of?">
                            Each of these is something Spotify cannot see. Every song will say why it is there.
                        </PageWords>

                        <Stack gap="10px">
                            <SectionLabel>Recipes</SectionLabel>
                            {RECIPES.map(option => (
                                <HStack
                                    key={option.id}
                                    as="button"
                                    aria-label={option.name}
                                    onClick={() => { feedback("press"); setRecipe(option.id); }}
                                    textAlign="left"
                                    gap="12px"
                                    alignItems="center"
                                    padding="14px 16px"
                                    borderRadius="16px"
                                    background={SURFACE_HI}
                                    _active={{ opacity: 0.7 }}
                                >
                                    <Stack gap="3px" flex="1" minWidth="0">
                                        <Text fontFamily="Inter" fontWeight="800" fontSize="18px" letterSpacing="-0.02em" color={INK}>
                                            {option.name}
                                        </Text>
                                        <Text fontSize="13px" color={INK_DIM}>
                                            {option.blurb}
                                        </Text>
                                    </Stack>
                                    <Box color={INK_FAINT} flexShrink={0}>
                                        <ChevronRight size={20} />
                                    </Box>
                                </HStack>
                            ))}
                        </Stack>
                    </>
                ) : (
                    <>
                        <TextAction label="‹ Choose another" onClick={() => { setRecipe(null); setPreview(null); }} tone="dim" />

                        <PageWords title={recipeNamed(recipe).name}>
                            {recipeNamed(recipe).blurb}
                        </PageWords>

                        {preview === null ? (
                            <Stack gap="0" aria-label="Building the playlist">
                                {[0, 1, 2, 3].map(i => (
                                    <HStack key={i} gap="12px" paddingY="8px">
                                        <Skeleton width="52px" height="52px" borderRadius="8px" startColor={SURFACE_HI} endColor="#26252b" />
                                        <Stack gap="6px" flex="1">
                                            <Skeleton height="14px" width="60%" borderRadius="6px" startColor={SURFACE_HI} endColor="#26252b" />
                                            <Skeleton height="12px" width="40%" borderRadius="6px" startColor={SURFACE_HI} endColor="#26252b" />
                                            <Skeleton height="12px" width="70%" borderRadius="6px" startColor={SURFACE_HI} endColor="#26252b" />
                                        </Stack>
                                    </HStack>
                                ))}
                            </Stack>
                        ) : preview.length === 0 ? (
                            <Text fontSize="15px" color={INK_DIM} maxWidth="36ch">
                                {note ?? "Nothing fits this recipe yet. Some more listening, or a few more swipes in Discover, and there will be."}
                            </Text>
                        ) : (
                            <>
                                <Stack gap="10px">
                                    <SectionLabel>Name it</SectionLabel>
                                    <Input
                                        aria-label="Playlist name"
                                        value={name}
                                        maxLength={60}
                                        onChange={e => setName(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter") make(); }}
                                        height="48px"
                                        borderRadius="12px"
                                        border="none"
                                        background={SURFACE_HI}
                                        color={INK}
                                        fontFamily="Inter"
                                        fontWeight="700"
                                        fontSize="16px"
                                        _focus={{ boxShadow: `0 0 0 2px ${ACCENT}` }}
                                        _placeholder={{ color: INK_FAINT }}
                                        placeholder={recipeNamed(recipe).name}
                                    />
                                </Stack>

                                <PrimaryButton label={making ? "Making it…" : `Make it · ${songCount(preview.length)}`} onClick={make} disabled={making} />

                                {note && <Note>{note}</Note>}

                                <Stack gap="0" marginX="-4px" paddingX="4px">
                                    <SectionLabel>What goes in</SectionLabel>
                                    {preview.map(song => (
                                        <PlaylistSongRow key={song.id} song={song} now={now} />
                                    ))}
                                </Stack>
                            </>
                        )}
                    </>
                )}
            </Stack>
        </Box>
    );
}
