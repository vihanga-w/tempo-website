import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import { getSizedImageUrl } from "@/lib/sized-img";
import { Avatar, Box, HStack, Image, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { formatTimeToMinAndHour, getSpotifyDeeplink } from "./playback-state";

/** Long enough to read as a crossfade rather than a flicker. */
const FACT_FADE_MS = 650;

/** Time each fact holds before the next one is brought in. */
const FACT_HOLD_MS = 7000;

export function FriendNowPlayingCard({
    userId,
    username,
    pfpUrl,
    streamer,
    openPubProfile,
}: Readonly<{
    userId: string;
    username: string;
    pfpUrl?: string;
    streamer?: DataStreamer | null;
    openPubProfile?: (id: string) => void;
}>) {
    const [state, setState] = useState<UpdateEvent["data"]["state"]>();
    const [progress, setProgress] = useState<number>(0);
    const [artFailed, setArtFailed] = useState<boolean>(false);

    useEffect(() => {
        if (!streamer)
            return;

        const apply = (d: UpdateEvent) => {
            setState(d.data.state);
            setProgress(d.data.interpolatedProgress ?? d.data.state?.progressNormal ?? 0);
        };

        const prev = streamer.getPrevState(userId);

        if (prev)
            apply(prev);

        const onUpdate = (d: unknown) => apply(d as UpdateEvent);
        const onRemove = (id: string) => {
            if (id === userId) {
                setState(undefined);
                setProgress(0);
            }
        };

        streamer.on(`update-${userId}`, onUpdate);
        streamer.on("remove", onRemove);

        return () => {
            streamer.off?.(`update-${userId}`, onUpdate);
            streamer.off?.("remove", onRemove);
        };
    }, [streamer, userId]);

    /**
     * A single rotating detail about how they are listening.
     *
     * Mirrors the For You feed's treatment: one line that swaps as the session
     * changes, rather than a static row of stats. Priority runs most-interesting
     * first, with the streak as the fallback whenever nothing else stands out —
     * a long unbroken session is the thing Tempo knows that Spotify does not.
     */
    const factPool = useMemo(() => {
        if (!state)
            return [];

        if (!state.isPlaying)
            return ["Paused"];

        const stats = state.todayStats;
        const pool: string[] = [];

        // The streak leads: it is the thing Tempo knows that Spotify does not,
        // and as a fallback it was almost never reached
        const start = state.playSessionStart ?? -1;

        if (start !== -1 && Date.now() - start >= 5 * 60e3)
            pool.push(`🔥 ${formatTimeToMinAndHour(Date.now() - start, true)}`);

        if (state.replayCount > 0)
            pool.push(`Replayed ×${state.replayCount}`);

        if (stats?.completeListenCount >= 3)
            pool.push(`Played ${stats.completeListenCount} times today`);

        if (stats?.totalSessionDuration >= 2 && state.duration)
            pool.push(`${formatTimeToMinAndHour(stats.totalSessionDuration * state.duration)} on this today`);

        if (stats?.skipCount >= 3)
            pool.push(`Skipped ${stats.skipCount} times today`);

        if (pool.length === 0 && start !== -1)
            pool.push("Started listening recently");

        return pool;
        // updatedAt keeps the streak text counting up as it rotates
    }, [state?.songId, state?.isPlaying, state?.replayCount, state?.todayStats, state?.duration, state?.playSessionStart, state?.updatedAt]);

    /**
     * Cycles the facts rather than electing one.
     *
     * Picking a single fact by displaySeed meant the same line sat there for the
     * whole song, and anything below it in the priority order — the streak, most
     * of the time — was never seen at all.
     */
    const [factIndex, setFactIndex] = useState<number>(0);

    useEffect(() => {
        if (factPool.length <= 1)
            return;

        const id = setInterval(() => setFactIndex(v => v + 1), FACT_HOLD_MS);

        return () => clearInterval(id);
    }, [factPool.length]);

    const fact = factPool.length > 0 ? factPool[factIndex % factPool.length] : null;

    /**
     * Crossfades between facts.
     *
     * The rendered text is held separately from the current fact so the old line
     * can fade out before the new one is swapped in. Rendering `fact` directly
     * meant the text changed instantly and then animated, so the swap was visible
     * mid-fade rather than hidden by it.
     */
    const [displayedFact, setDisplayedFact] = useState<string | null>(null);
    const [factShown, setFactShown] = useState<boolean>(false);

    useEffect(() => {
        if (fact === displayedFact)
            return;

        // First fact of a session has nothing to fade out from
        if (displayedFact === null) {
            setDisplayedFact(fact);
            setFactShown(true);

            return;
        }

        setFactShown(false);

        const t = setTimeout(() => {
            setDisplayedFact(fact);
            setFactShown(true);
        }, FACT_FADE_MS);

        return () => clearTimeout(t);
    }, [fact, displayedFact]);

    if (!state)
        return null;

    const isPlaying = state.isPlaying;
    const pct = Math.min(Math.max(progress, 0), 1) * 100;
    const remainingMs = Math.max(0, state.duration - (progress * state.duration));
    const remaining = `${Math.floor(remainingMs / 60000)}:${Math.floor((remainingMs % 60000) / 1000).toString().padStart(2, "0")}`;

    return (
        <Box
            cursor={openPubProfile ? "pointer" : "default"}
            onClick={() => openPubProfile?.(userId)}
        >
            <HStack gap="14px" align="flex-start">
                {/* Tapping the artwork opens the track — the obvious thing to want
                    when you can see what a friend is playing */}
                <Box
                    position="relative"
                    minWidth="76px"
                    width="76px"
                    height="76px"
                    flexShrink="0"
                    role="button"
                    aria-label={`Play ${state.name} on Spotify`}
                    onClick={e => {
                        e.stopPropagation();

                        if (state.songId)
                            window.open(getSpotifyDeeplink(state.songId));
                    }}
                    sx={{
                        "&:active": { transform: "scale(0.96)" },
                        "&:active .tempo-play-badge": { opacity: 1 },
                    }}
                    transition="transform .12s ease"
                >
                    {(state.imageUrl && !artFailed) ? (
                        <Image
                            width="76px"
                            height="76px"
                            borderRadius="12px"
                            objectFit="cover"
                            src={getSizedImageUrl(state.imageUrl, 80, 80)}
                            alt=""
                            draggable={false}
                            onError={() => setArtFailed(true)}
                            opacity={isPlaying ? 1 : 0.5}
                            transition="opacity .2s ease"
                        />
                    ) : (
                        <Box width="76px" height="76px" borderRadius="12px" background="rgba(255,255,255,0.06)" />
                    )}

                    <Box
                        className="tempo-play-badge"
                        position="absolute"
                        right="-4px"
                        bottom="-4px"
                        width="26px"
                        height="26px"
                        borderRadius="50%"
                        background="#1DB954"
                        border="2px solid #0D0D0E"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        opacity="0.92"
                        transition="opacity .15s ease"
                    >
                        <Box
                            width="0"
                            height="0"
                            marginLeft="2px"
                            borderTop="5px solid transparent"
                            borderBottom="5px solid transparent"
                            borderLeft="8px solid #0D0D0E"
                        />
                    </Box>
                </Box>

                <Stack gap="3px" flex="1" minWidth="0" paddingTop="1px">
                    {/* Name, with the streak balanced against it */}
                    <HStack gap="7px" align="center" minWidth="0">
                        {(pfpUrl && pfpUrl !== "") ? (
                            <Image
                                width="15px"
                                height="15px"
                                minWidth="15px"
                                borderRadius="5px"
                                objectFit="cover"
                                src={getSizedImageUrl(pfpUrl, 16, 16)}
                                alt=""
                                draggable={false}
                                opacity="0.85"
                            />
                        ) : (
                            <Avatar name={username + userId} width="15px" height="15px" minWidth="15px" borderRadius="5px" />
                        )}
                        <Text
                            fontFamily="Inter"
                            fontSize="11px"
                            fontWeight="semibold"
                            letterSpacing="0.09em"
                            textTransform="uppercase"
                            color="text.color"
                            opacity="0.55"
                            userSelect="none"
                            whiteSpace="nowrap"
                            overflow="hidden"
                            textOverflow="ellipsis"
                            flex="1"
                        >{username}</Text>
                    </HStack>

                    <Text
                        fontFamily="Inter"
                        fontWeight="semibold"
                        fontSize="17px"
                        lineHeight="1.3"
                        userSelect="none"
                        whiteSpace="nowrap"
                        overflow="hidden"
                        textOverflow="ellipsis"
                    >{state.name}</Text>

                    <Text
                        fontFamily="Inter"
                        fontSize="13px"
                        lineHeight="1.3"
                        color="text.color"
                        opacity="0.55"
                        userSelect="none"
                        whiteSpace="nowrap"
                        overflow="hidden"
                        textOverflow="ellipsis"
                    >{state.artists.map(v => v.name).join(", ")}</Text>

                    {/* Slides in on change, the way the For You feed presents these */}
                    <Text
                        fontFamily="Inter"
                        fontSize="13px"
                        fontWeight="medium"
                        lineHeight="1.3"
                        color="#b4b4b4"
                        height="17px"
                        opacity={factShown && displayedFact ? 1 : 0}
                        transform={factShown && displayedFact ? "translateY(0)" : "translateY(3px)"}
                        transition={`opacity ${FACT_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${FACT_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`}
                        userSelect="none"
                        whiteSpace="nowrap"
                        overflow="hidden"
                        textOverflow="ellipsis"
                    >{displayedFact ?? ""}</Text>

                </Stack>
            </HStack>

            <HStack gap="10px" align="center" marginTop="12px">
                <Box flex="1" height="3px" borderRadius="2px" background="rgba(255,255,255,0.12)" overflow="hidden" minWidth="0">
                    <Box
                        height="100%"
                        width={`${pct}%`}
                        borderRadius="2px"
                        background="accent.dark"
                        opacity={isPlaying ? 1 : 0.45}
                        transition="width .25s linear, opacity .2s ease"
                    />
                </Box>
                <Text
                    fontFamily="Inter"
                    fontSize="11px"
                    color="secondary.dark"
                    flexShrink="0"
                    userSelect="none"
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                >-{remaining}</Text>
            </HStack>
        </Box>
    );
}
