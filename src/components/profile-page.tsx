import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import User, { ClientUserAccount } from "@/lib/usrlib";
import { Box, Center, Grid, GridItem, HStack, Skeleton, Spinner, Stack, Text } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { getSpotifyDeeplink, SkeletonImage } from "./playback-state";
import {
    extractArtworkColour,
    FALLBACK_ACCENT,
    PAGE_BG,
    panelFill,
    readableAccent,
    rgbToHex,
    type Rgb,
} from "@/lib/artwork-colour";
import { MdExplicit } from "react-icons/md";
import { getSizedImageUrl } from "@/lib/sized-img";
import { findBestSCDNImageSize, formatListening } from "@/lib/utils";
import { useCountUp } from "@/lib/use-count-up";
import { FaCog, FaHistory } from "react-icons/fa";
import { Recap } from "./recap-drawer";
import FriendHistoryFeed from "./friend-history-feed";
import { InitialAvatar } from "./initial-avatar";

/**
 * The page reads as a record sleeve and a printed week card rather than as a
 * dashboard, because that is the voice the rest of the app already speaks in —
 * the leaderboard draws its own medals rather than borrowing three emoji.
 *
 * Everything is set in Inter, which is what the rest of the app is set in.
 * Libre Franklin Black Italic appears in exactly one place across the whole
 * codebase — the page title in the frame — and borrowing it down here for the
 * figures made the profile read as a different app bolted onto this one. The
 * weight range does the work instead: 800 with tight tracking for anything that
 * has to carry, regular for everything else.
 *
 * Surfaces are flat and unoutlined, and no two radii match by accident. Panels
 * are told apart by fill and by the space around them, which is what stops a
 * page of stacked cards from reading as a settings screen.
 */
const INK = "#f6f5f8";
const INK_DIM = "#9d9aa6";
const INK_FAINT = "#65626e";

/** Flat, borderless, one step off the page. */
const SURFACE = "#151517";
const SURFACE_HI = "#1c1b20";

/** Shape carries meaning here, so the radii are deliberately unalike. */
const SLEEVE_RADIUS = "6px";
const TILE_RADIUS = "22px";

interface TopSong {
    id: string;
    title: string;
    artists: string[];
    index: number;
    explicit: boolean;
    playCount: number;
    imageUrl: string;
}

type TopSongsPeriod = "day" | "week" | "month";

const TOP_SONG_PERIODS: { id: TopSongsPeriod; label: string }[] = [
    { id: "day", label: "24h" },
    { id: "week", label: "7d" },
    { id: "month", label: "30d" },
];

/** How long a session has to run before it is worth calling a streak. */
const STREAK_MIN_MS = 60e3 * 5;

const rise = keyframes`
    from { transform: translateY(14px); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
`;

/** The record turning behind the sleeve. Slow enough to notice only if you look. */
const spin = keyframes`
    from { transform: translateY(-50%) rotate(0deg); }
    to   { transform: translateY(-50%) rotate(360deg); }
`;

function formatClock(ms: number) {
    if (ms < 0)
        ms = 0;

    const seconds = Math.floor(ms / 1e3);

    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * A section heading, with a rule running out to the edge.
 *
 * Not a small-caps label in grey. Every page built out of grey letterspaced
 * captions reads as the same page, and none of them read as this app.
 */
function Rubric({
    children,
    colour,
    action,
}: Readonly<{
    children: ReactNode;
    colour: string;
    action?: ReactNode;
}>) {
    return (
        <HStack gap="12px" alignItems="center" minHeight="32px" marginBottom="12px">
            <Text
                fontFamily="Inter"
                fontWeight="800"
                fontSize="19px"
                letterSpacing="-0.02em"
                color={colour}
                whiteSpace="nowrap"
                transition="color .45s"
            >
                {children}
            </Text>
            <Box flex="1" height="2px" borderRadius="full" background="rgba(255,255,255,0.06)" minWidth="8px" />
            {action}
        </HStack>
    );
}

/**
 * A figure, set the size it deserves.
 *
 * The count-up runs on the underlying number and the text is formatted from it
 * every frame, so a duration climbs as a duration ("2h 41m") rather than
 * arriving as a bare minute count the reader has to divide in their head.
 */
function Figure({
    value,
    format,
    size,
    colour,
}: Readonly<{
    value: number;
    format: (value: number) => string;
    size: string | Record<string, string>;
    colour: string;
}>) {
    const counted = useCountUp(value);

    return (
        <Text
            fontFamily="Inter"
            fontWeight="800"
            fontSize={size}
            lineHeight="1"
            letterSpacing="-0.04em"
            sx={{ fontVariantNumeric: "tabular-nums" }}
            color={colour}
            whiteSpace="nowrap"
            transition="color .45s"
        >
            {format(counted)}
        </Text>
    );
}

/**
 * Something to say about the week, rather than a caption under a number.
 *
 * The leaderboard already talks to the reader like this, and it is the most
 * characterful thing in the app. A profile that only prints totals is a receipt.
 */
function weekLine(
    stats: { totalListeningDuration: number; uniqueSongsPlayedCount: number; longestStreak: number },
    isOwnProfile: boolean,
): string {
    const hours = stats.totalListeningDuration / 3600e3;

    if (stats.totalListeningDuration <= 0)
        return (isOwnProfile ? "Press play and this starts filling in." : "Nothing played in the past week.");

    if (hours >= 20)
        return `Twenty hours and counting. ${isOwnProfile ? "Your" : "Their"} headphones have earned a rest.`;

    if (hours >= 10)
        return `A proper week — ${stats.uniqueSongsPlayedCount} different songs got a turn.`;

    if (stats.longestStreak >= 3600e3)
        return `Mostly in one sitting: ${formatListening(stats.longestStreak)} without stopping.`;

    if (hours >= 3)
        return `${stats.uniqueSongsPlayedCount} different songs across the week.`;

    return `A quiet week — ${stats.uniqueSongsPlayedCount === 1 ? "one song" : `${stats.uniqueSongsPlayedCount} songs`} so far.`;
}

/**
 * The record, showing from behind the sleeve.
 *
 * Drawn rather than fetched: it is a stack of radial gradients, so it costs
 * nothing to load and stays sharp at any size. It turns only while something is
 * actually playing — a disc spinning under a paused track is the sort of detail
 * that makes an interface feel like it is not paying attention.
 */
function Record({ size, offset, playing, label }: Readonly<{ size: number; offset: number; playing: boolean; label: string }>) {
    return (
        <Box
            pos="absolute"
            top="50%"
            left={`${offset}px`}
            width={`${size}px`}
            height={`${size}px`}
            borderRadius="full"
            zIndex={0}
            aria-hidden
            boxShadow="0 12px 28px rgba(0,0,0,0.6)"
            sx={{
                background: [
                    // Spindle hole, then the centre label in the colour of
                    // whatever is playing — the sleeve covers most of it, so only
                    // a sliver of the colour comes out past the edge, which is
                    // exactly how much of a label you see on a record in its sleeve
                    "radial-gradient(circle at 50% 50%, #08080a 0 3.5%, transparent 3.8%)",
                    `radial-gradient(circle at 50% 50%, ${label} 3.8% 30%, transparent 30.3%)`,
                    // The grooves. Fine and low contrast — at this size a coarse
                    // ring pattern reads as a target rather than as vinyl
                    "repeating-radial-gradient(circle at 50% 50%, #26262f 0 1px, #0d0d11 1px 2.5px)",
                ].join(", "),
                animation: `${spin} 9s linear infinite`,
                animationPlayState: (playing ? "running" : "paused"),
            }}
        />
    );
}

/**
 * What is playing, given the whole top of the page.
 *
 * This is the only live thing on a profile and the reason somebody opens one, so
 * it gets the artwork at a size worth looking at and the page's only surface
 * painted in the artwork's own colour. Everything below it stays neutral, which
 * is what keeps this one loud.
 */
function NowSpinning({
    state,
    tint,
    accent,
    progress,
}: Readonly<{
    state: NonNullable<UpdateEvent["data"]["state"]>;
    tint: Rgb | null;
    accent: string;
    progress: number;
}>) {
    const elapsed = (state.duration ?? 0) * Math.min(progress, 1);

    return (
        <Box
            borderRadius={TILE_RADIUS}
            padding="18px"
            overflow="hidden"
            position="relative"
            background={tint ? panelFill(tint) : SURFACE_HI}
            transition="background .6s"
        >
            <HStack gap="0" alignItems="center" marginBottom="18px">
                <Box position="relative" width="112px" height="112px" flexShrink={0}>
                    <Record size={116} offset={44} playing={state.isPlaying !== false} label={accent} />

                    <Box position="relative" zIndex={1} boxShadow="0 8px 24px rgba(0,0,0,0.45)" borderRadius={SLEEVE_RADIUS}>
                        <SkeletonImage
                            width="112px"
                            height="112px"
                            borderRadius={SLEEVE_RADIUS}
                            src={getSizedImageUrl(state.imageUrl ?? "", 300, 300)}
                        />
                    </Box>
                </Box>

                {/*
                  * Pushed clear of the record's edge rather than set against the
                  * sleeve, or the first letter of every title lands on the grooves.
                  */}
                <Stack gap="3px" minWidth="0" flex="1" paddingLeft="64px">
                    <HStack gap="4px" minWidth="0">
                        <Text fontSize="19px" fontWeight="bold" color="#ffffff" noOfLines={2} lineHeight="1.15">
                            {state.name}
                        </Text>
                        {state.explicit && <Box color="rgba(255,255,255,0.5)" flexShrink={0}><MdExplicit /></Box>}
                    </HStack>
                    <Text fontSize="14px" color="rgba(255,255,255,0.72)" noOfLines={1}>
                        {state.artists?.map(v => v.name).join(", ")}
                    </Text>
                </Stack>
            </HStack>

            <Stack gap="7px">
                <Box height="4px" borderRadius="full" background="rgba(0,0,0,0.38)" overflow="hidden">
                    <Box
                        height="100%"
                        borderRadius="full"
                        width={`${Math.min(progress * 100, 100)}%`}
                        background="#ffffff"
                        transition="width .6s linear"
                    />
                </Box>
                <HStack justifyContent="space-between" alignItems="center">
                    <Text fontSize="11px" color="rgba(255,255,255,0.6)" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatClock(elapsed)}
                    </Text>
                    <Text
                        fontSize="11.5px"
                        fontWeight="semibold"
                        color="rgba(255,255,255,0.82)"
                        cursor="pointer"
                        onClick={() => {
                            if (state.songId)
                                window.open(getSpotifyDeeplink(state.songId));
                        }}
                    >
                        Open in Spotify
                    </Text>
                    <Text fontSize="11px" color="rgba(255,255,255,0.6)" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatClock(state.duration ?? 0)}
                    </Text>
                </HStack>
            </Stack>
        </Box>
    );
}

/**
 * The song at the top, treated as the thing it is.
 *
 * Five identical rows is a table of five songs. One of them was played more than
 * anything else this person listened to, which is worth more than a row.
 */
function TopSongHero({ song, accent }: Readonly<{ song: TopSong; accent: string }>) {
    return (
        <HStack gap="15px" alignItems="center" marginBottom="20px">
            <Box position="relative" flexShrink={0}>
                <SkeletonImage
                    width="96px"
                    height="96px"
                    borderRadius="10px"
                    src={getSizedImageUrl(song.imageUrl, 300, 300)}
                />
                {/*
                  * The placing sits on the corner of the sleeve rather than in a
                  * column of numbers, so the picture and its rank read as one
                  * object.
                  */}
                <Center
                    position="absolute"
                    left="-10px"
                    top="-10px"
                    width="34px"
                    height="34px"
                    borderRadius="full"
                    background={accent}
                    boxShadow="0 4px 14px rgba(0,0,0,0.5)"
                    transition="background .45s"
                >
                    <Text
                        fontFamily="Inter"
                        fontWeight="800"
                        fontSize="17px"
                        letterSpacing="-0.03em"
                        color="#101013"
                        lineHeight="1"
                    >
                        1
                    </Text>
                </Center>
            </Box>

            <Stack gap="4px" minWidth="0" flex="1">
                <HStack gap="4px" minWidth="0">
                    <Text fontSize="20px" fontWeight="bold" color={INK} noOfLines={2} lineHeight="1.15">
                        {song.title}
                    </Text>
                    {song.explicit && <Box color={INK_FAINT} flexShrink={0}><MdExplicit /></Box>}
                </HStack>
                <Text fontSize="14px" color={INK_DIM} noOfLines={1}>
                    {song.artists.join(", ")}
                </Text>
                <Text fontSize="13px" color={accent} fontWeight="semibold" transition="color .45s">
                    {song.playCount === 1 ? "Played once" : `Played ${song.playCount} times`}
                </Text>
            </Stack>
        </HStack>
    );
}

/**
 * One of the runners-up.
 *
 * The rank is set in the same weight as the figures and left deliberately dim —
 * big enough to scan down, quiet enough that the songs stay the subject.
 */
function TopSongRow({ song, rank }: Readonly<{ song: TopSong; rank: number }>) {
    return (
        <HStack gap="13px" alignItems="center">
            <Text
                fontFamily="Inter"
                fontWeight="800"
                fontSize="19px"
                letterSpacing="-0.03em"
                sx={{ fontVariantNumeric: "tabular-nums" }}
                color="#3b3944"
                minWidth="22px"
                textAlign="center"
                flexShrink={0}
                lineHeight="1"
            >
                {rank}
            </Text>

            <SkeletonImage
                width="44px"
                height="44px"
                borderRadius="7px"
                src={getSizedImageUrl(song.imageUrl, 96, 96)}
                loading="lazy"
            />

            <Stack gap="0" flex="1" minWidth="0">
                <HStack gap="4px" minWidth="0">
                    <Text fontSize="15px" fontWeight="semibold" color={INK} noOfLines={1}>
                        {song.title}
                    </Text>
                    {song.explicit && <Box color={INK_FAINT} flexShrink={0}><MdExplicit /></Box>}
                </HStack>
                <Text fontSize="13px" color={INK_DIM} noOfLines={1}>
                    {song.artists.join(", ")}
                </Text>
            </Stack>

            <Text fontSize="13px" color={INK_FAINT} whiteSpace="nowrap" flexShrink={0}>
                {song.playCount === 1 ? "once" : `${song.playCount}×`}
            </Text>
        </HStack>
    );
}

function TopSongSkeletons() {
    return (
        <Stack gap="16px">
            <HStack gap="15px" alignItems="center">
                <Skeleton height="96px" width="96px" borderRadius="10px" />
                <Stack gap="8px" flex="1">
                    <Skeleton height="18px" width="70%" borderRadius="3px" />
                    <Skeleton height="13px" width="45%" borderRadius="3px" />
                    <Skeleton height="12px" width="30%" borderRadius="3px" />
                </Stack>
            </HStack>
            {[1, 2, 3, 4].map(i => (
                <HStack key={i} gap="13px" alignItems="center">
                    <Skeleton height="18px" width="14px" borderRadius="3px" />
                    <Skeleton height="44px" width="44px" borderRadius="7px" />
                    <Stack gap="6px" flex="1">
                        <Skeleton height="13px" width="55%" borderRadius="3px" />
                        <Skeleton height="11px" width="32%" borderRadius="3px" />
                    </Stack>
                </HStack>
            ))}
        </Stack>
    );
}

/** Says nothing is here yet, and what would put something here. */
function Empty({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <Text fontSize="14px" color={INK_FAINT} lineHeight="1.55" paddingY="10px" maxWidth="34ch">
            {children}
        </Text>
    );
}

/**
 * A tappable icon with a target big enough to hit.
 *
 * The icons used to be bare glyphs with a click handler, which on a phone is a
 * 26 pixel target sitting under the top edge of the screen.
 */
function HeaderAction({
    label,
    colour,
    onClick,
    children,
}: Readonly<{
    label: string;
    colour: string;
    onClick: () => void;
    children: ReactNode;
}>) {
    return (
        <Center
            role="button"
            aria-label={label}
            tabIndex={0}
            width="44px"
            height="44px"
            borderRadius="full"
            color={colour}
            transition="color .45s, background .15s"
            cursor="pointer"
            _active={{ background: "rgba(255,255,255,0.09)" }}
            onClick={onClick}
            onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ")
                    onClick();
            }}
        >
            {children}
        </Center>
    );
}

export default function ProfilePage({
    user,
    targetUserId,
    pageChanger,
    hideTopGradientCb,
    setComplementaryColour,
    setRecaps,
    openRecapDrawer,
    streamer,
}: Readonly<{
    user: User;
    targetUserId?: string;
    pageChanger: (id: string, prevPage?: string) => void;
    hideTopGradientCb: (hide: boolean) => void;
    setComplementaryColour: (hex: string) => void;
    setRecaps: (data: {
        daily: Recap | null;
        weekly: Recap | null;
    }) => void;
    openRecapDrawer: () => void;
    streamer?: DataStreamer;
}>) {
    const profileId = targetUserId ?? user.id;
    const isOwnProfile = !targetUserId;

    const [profileData, setProfileData] = useState<ClientUserAccount | undefined>(user.object);
    const [pfpLoadFailed, setPfpLoadFailed] = useState(false);
    const [playbackState, setPlaybackState] = useState<UpdateEvent | null>(null);
    const [streamerReset, setStreamerReset] = useState<boolean>(false);

    /** The artwork colour as it arrives, and the copy the page is painted from. */
    const [accent, setAccent] = useState<Rgb | null>(null);
    const [committedAccent, setCommittedAccent] = useState<Rgb | null>(null);
    const [accentVisible, setAccentVisible] = useState<boolean>(false);
    /** The same colour, lifted until text set in it is legible. */
    const [accentInk, setAccentInk] = useState<string>(FALLBACK_ACCENT);

    const [listenershipHistoryAvailable, setListenershipHistoryAvailable] = useState<boolean>(false);
    const [topSongsFilter, setTopSongsFilter] = useState<TopSongsPeriod>("day");
    const [userTopSongs, setUserTopSongs] = useState<TopSong[]>([]);
    const [topSongsLoading, setTopSongsLoading] = useState<boolean>(true);
    const [pageLoaded, setPageLoaded] = useState<boolean>(false);
    const [pastWeekStats, setPastWeekStats] = useState<{
        totalListeningDuration: number;
        uniqueSongsPlayedCount: number;
        longestStreak: number;
    } | undefined>();
    const [recapState, setRecapsState] = useState<{
        daily: Recap | null;
        weekly: Recap | null;
    }>({
        daily: null,
        weekly: null,
    });

    /**
     * Bumped whenever the listening history should go back for anything new.
     *
     * Paired with the song currently playing below, so the feed also refreshes
     * the moment a track ends — which is exactly when the entry for it is
     * written, and the one time somebody watching the page expects to see it
     * appear.
     */
    const [historyRefreshTick, setHistoryRefreshTick] = useState(0);

    const setStatusBarColour = (colour: string) => {
        document.querySelector("meta[name=theme-color]")?.setAttribute("content", colour);
    };

    /**
     * Pulls the listening figures again.
     *
     * These move with every track played, so the page has to go back for them
     * rather than showing whatever it fetched when it opened. `force` skips the
     * cache for a refresh the reader can feel — returning to the app and finding
     * the same numbers as ten minutes ago reads as the page being broken.
     */
    const refreshListeningStats = (force?: boolean) => {
        user.getRemoteUserPastWeekStats(profileId, force)
        .then(d => {
            setPastWeekStats(d);
        })
        .catch(e => {
            console.error("Failed to fetch past week stats, error:", e);
        });

        user.getRemoteUserTopSongs(profileId, topSongsFilter, force)
        .then(data => {
            setUserTopSongs(data.slice(0, 5));
        })
        .catch(e => {
            console.error("Failed to refresh top songs, error:", e);
        });
    };

    // Kept in a ref so the listeners below are attached once rather than
    // re-attached whenever the filter or the target changes
    const refreshStatsRef = useRef(refreshListeningStats);

    refreshStatsRef.current = refreshListeningStats;

    useEffect(() => {
        // While the page is open, and again whenever it is returned to. Coming
        // back after listening is exactly when somebody looks at these.
        const onReturn = () => {
            refreshStatsRef.current(true);
            setHistoryRefreshTick(t => t + 1);
        };

        const timer = setInterval(onReturn, 60e3);

        window.addEventListener("focus", onReturn);
        document.addEventListener("visibilitychange", onReturn);

        return () => {
            clearInterval(timer);
            window.removeEventListener("focus", onReturn);
            document.removeEventListener("visibilitychange", onReturn);
        };
    }, []);

    useEffect(() => {
        user.getRecaps(true)
        .then(recaps => {
            setRecapsState(recaps);
        })
        .catch(ex => {
            console.error("Failed to fetch latest user recaps, error:", ex);
        });

        refreshListeningStats();

        user.getFriendProfileListenershipHistory(profileId, 0)
        .then(h => {
            if (h.data.length > 0)
                setListenershipHistoryAvailable(true);
        })
        .catch(e => {
            console.error("Failed to check if listenership history is available, error:", e);
        });

        // Somebody else's profile starts from nothing rather than from the
        // signed-in account, which would otherwise flash the reader's own name
        if (targetUserId)
            setProfileData(undefined);
    }, []);

    useEffect(() => {
        setTopSongsLoading(true);

        let cancelled = false;

        user.getRemoteUserTopSongs(profileId, topSongsFilter)
        .then(data => {
            if (cancelled)
                return;

            setUserTopSongs(data.slice(0, 5));
            setTopSongsLoading(false);
        })
        .catch(e => {
            if (cancelled)
                return;

            console.error("Failed to load top songs, error:", e);

            setUserTopSongs([]);
            setTopSongsLoading(false);
        });

        return () => { cancelled = true; };
    }, [topSongsFilter, profileId]);

    /**
     * The profile itself, and the live playback behind the page's colour.
     *
     * Nothing here gates the page beyond the profile: the artwork colour only
     * arrives when the person happens to be playing something, so waiting on it
     * left an idle profile sitting on a spinner until a timeout expired. It
     * fades in whenever it resolves instead.
     */
    useEffect(() => {
        let cancelled = false;

        const settle = () => {
            if (!cancelled)
                setPageLoaded(true);
        };

        // A profile that will not load is still a page worth showing the rest of
        const failsafe = setTimeout(settle, 4000);

        user.getRemoteUser(profileId)
        .then(r => {
            if (!cancelled)
                setProfileData(r);
        })
        .catch(e => {
            console.error("Failed to get remote user for", profileId, "error:", e);
        })
        .finally(() => {
            clearTimeout(failsafe);
            settle();
        });

        let streamerGotMsg = false;

        // Until something is playing, the page takes its colour from the profile
        // picture — an idle profile with no colour at all is the same near black
        // rectangle for everybody
        if (user?.object && user.object.images.length > 0) {
            extractArtworkColour(user.object.images[0]?.url)
            .then(colour => {
                if (cancelled || streamerGotMsg)
                    return;

                setAccent(colour);
            })
            .catch(e => {
                console.error("Failed to read a colour off the profile picture, error:", e);
            });
        }

        if (!streamer)
            return () => {
                cancelled = true;
                clearTimeout(failsafe);
            };

        streamer.detachedListeningStateQuery([profileId]);

        const onUpdate = (data: UpdateEvent) => {
            if (data.userId !== profileId)
                return;

            setPlaybackState(() => {
                if (data.data.state) {
                    streamerGotMsg = true;

                    extractArtworkColour(data.data.state.imageUrl)
                    .then(colour => {
                        if (!cancelled)
                            setAccent(colour);
                    })
                    .catch(e => {
                        console.error("Failed to read a colour off the artwork, error:", e);
                    });
                }

                if (data.data.action.type == "STOPPED") {
                    setAccent(null);

                    return null;
                }

                return data;
            });
        };

        const onRemove = (userId: string) => {
            if (userId !== profileId)
                return;

            setPlaybackState(null);
            setAccent(null);
        };

        streamer.on("update", onUpdate);
        streamer.on("remove", onRemove);

        return () => {
            cancelled = true;
            clearTimeout(failsafe);

            // Without this the listeners outlive the component, so every visit to
            // a profile stacks another pair and each event fires N setStates
            streamer.off?.("update", onUpdate);
            streamer.off?.("remove", onRemove);
        };
    }, [user.isLoggedIn, profileId]);

    /**
     * Cross-fades the page's colour rather than cutting to it.
     *
     * The new colour is held back until the old one has faded out, so a track
     * change moves through the page background instead of snapping it.
     */
    useEffect(() => {
        if (!accent) {
            setCommittedAccent(null);

            const timer = setTimeout(() => setAccentVisible(true), 20);

            return () => clearTimeout(timer);
        }

        setAccentVisible(false);

        const commit = setTimeout(() => setCommittedAccent(accent), 230);
        const show = setTimeout(() => setAccentVisible(true), 250);

        return () => {
            clearTimeout(commit);
            clearTimeout(show);
        };
    }, [accent]);

    useEffect(() => {
        hideTopGradientCb(accent !== null);
    }, [accent]);

    /**
     * The status bar, and the colour the app frame draws its title in.
     *
     * The status bar takes the artwork colour mixed halfway into the page, so the
     * bar reads as the top of the page rather than as a band of album cover above
     * it. The title takes the lifted, legible version.
     */
    useEffect(() => {
        if (!committedAccent) {
            setStatusBarColour(PAGE_BG);
            setAccentInk(FALLBACK_ACCENT);
            setComplementaryColour("#e9e7fb");

            return;
        }

        setStatusBarColour(rgbToHex({
            r: 0.5 * committedAccent.r + 0.5 * 13,
            g: 0.5 * committedAccent.g + 0.5 * 13,
            b: 0.5 * committedAccent.b + 0.5 * 14,
        }));

        const ink = readableAccent(committedAccent);

        setAccentInk(ink);
        setComplementaryColour(ink);
    }, [committedAccent]);

    useEffect(() => {
        const handleFocus = () => {
            if (streamer && !streamer.isReady()) {
                setPlaybackState(null);
                setStreamerReset(true);
            }
        };

        window.addEventListener("focus", handleFocus);

        return () => {
            window.removeEventListener("focus", handleFocus);
        };
    }, [streamer]);

    useEffect(() => {
        if (streamerReset && streamer && playbackState) {
            streamer.cleanup();
            streamer.init();
            setStreamerReset(false);
        }
    }, [playbackState, streamer, streamerReset]);

    const tint = (accentVisible ? committedAccent : null);
    const nowPlaying = playbackState?.data.state ?? null;
    const hasListened = (pastWeekStats?.totalListeningDuration ?? 0) > 0 || (pastWeekStats?.uniqueSongsPlayedCount ?? 0) > 0;

    /**
     * What the live panel is called.
     *
     * A session that has been running a while is worth saying out loud — it is
     * the one number on the page that is still climbing while you read it. The
     * page used to put this in an unstyled line under the name, where its idle
     * state read "No active streak": a sentence whose only content is that the
     * reader is not doing anything.
     */
    const sessionStart = nowPlaying?.playSessionStart;
    const sessionMs = (sessionStart && sessionStart !== -1 ? Date.now() - sessionStart : 0);

    const nowHeading = (sessionMs >= STREAK_MIN_MS
        ? `On a roll — ${formatListening(sessionMs)} straight`
        : "Now spinning");

    return (<>
        {isOwnProfile && (
            <HStack
                pos="fixed"
                top="0"
                right="12px"
                marginTop="env(safe-area-inset-top)"
                height="48px"
                zIndex="99999"
                alignItems="center"
                gap="0"
            >
                {(recapState.daily || recapState.weekly) && (
                    <HeaderAction
                        label="Your recaps"
                        colour={accentInk}
                        onClick={() => {
                            setRecaps(recapState);
                            openRecapDrawer();
                        }}
                    >
                        <FaHistory size="22px" />
                    </HeaderAction>
                )}
                <HeaderAction
                    label="Settings"
                    colour={accentInk}
                    onClick={() => pageChanger("preferences", "settings")}
                >
                    <FaCog size="22px" />
                </HeaderAction>
            </HStack>
        )}

        <Box
            display={pageLoaded ? "none" : "block"}
            width="100vw"
            height="100vh"
            background={PAGE_BG}
            pos="fixed"
            top="0"
            left="0"
            zIndex="999999"
        >
            <Center height="100vh">
                <Spinner size="lg" />
            </Center>
        </Box>

        {/*
          * The artwork bleeding down from the top of the page.
          *
          * One layer rather than the two the page carried before — a gradient and
          * a flat wash over the whole viewport, which together lifted the
          * background far enough that every panel had to be painted in full
          * saturation to be visible against it at all.
          */}
        <Box
            pos="fixed"
            left="0"
            top="0"
            zIndex="0"
            pointerEvents="none"
            background={committedAccent
                ? `linear-gradient(to bottom, rgb(${committedAccent.r},${committedAccent.g},${committedAccent.b}) 0%, rgba(0,0,0,0) 100%)`
                : "transparent"}
            opacity={accentVisible && committedAccent ? 0.2 : 0}
            transform={accentVisible ? "translateY(0)" : "translateY(-24px)"}
            width="100vw"
            height="260px"
            transition=".75s"
        />

        <Stack
            gap="30px"
            width="calc(100% - 20px)"
            paddingLeft="20px"
            paddingTop="20px"
            paddingBottom="36px"
            marginTop="-15px"
            zIndex="1"
            position="relative"
        >
            {/*
              * Who this is, kept to a strip.
              *
              * The frame above already announces the page, and on your own
              * profile you are not the news — what you are playing is. Padded
              * clear of the actions pinned to the top right, or a long display
              * name comes out with a cog sitting in the middle of it.
              */}
            <HStack
                gap="12px"
                alignItems="center"
                paddingRight={isOwnProfile ? "78px" : "20px"}
                animation={`${rise} .3s ease-out both`}
            >
                <Box
                    width="56px"
                    height="56px"
                    minWidth="56px"
                    borderRadius="18px"
                    flexShrink={0}
                    boxShadow={playbackState ? `0 0 0 2.5px ${PAGE_BG}, 0 0 0 5px ${accentInk}` : "none"}
                    transition="box-shadow .45s"
                >
                    {((profileData?.images.length ?? 0) > 0 && !pfpLoadFailed) ? (
                        <SkeletonImage
                            width="56px"
                            height="56px"
                            borderRadius="18px"
                            src={getSizedImageUrl(findBestSCDNImageSize(profileData?.images ?? [], 120, 120) ?? "", 120, 120)}
                            onError={() => setPfpLoadFailed(true)}
                        />
                    ) : (
                        <InitialAvatar
                            userId={profileData?.id ?? profileId}
                            displayName={profileData?.displayName}
                            borderRadius="18px"
                            size="56px"
                        />
                    )}
                </Box>

                <Stack gap="6px" minWidth="0" flex="1">
                    {profileData?.displayName ? (
                        <Text
                            fontFamily="Inter"
                            fontWeight="bold"
                            fontSize="21px"
                            lineHeight="1.15"
                            color={INK}
                            noOfLines={2}
                        >
                            {profileData.displayName}
                        </Text>
                    ) : (
                        <Skeleton height="20px" width="55%" borderRadius="4px" />
                    )}

                    {/*
                      * The classification, stuck on at an angle.
                      *
                      * It is the one thing Tempo works out about somebody rather
                      * than counts, and as a second line of grey text it read as
                      * a caption nobody had bothered to write.
                      */}
                    <Box alignSelf="flex-start" transform="rotate(-2.2deg)">
                        <Box paddingX="10px" paddingY="4px" borderRadius="full" background={SURFACE_HI}>
                            <Text
                                fontFamily="Inter"
                                fontWeight="700"
                                fontSize="11.5px"
                                letterSpacing="-0.005em"
                                color={accentInk}
                                noOfLines={1}
                                transition="color .45s"
                            >
                                {profileData?.listenerTypeClassification ?? "Casual Listener"}
                            </Text>
                        </Box>
                    </Box>
                </Stack>
            </HStack>

            {nowPlaying && (
                <Box animation={`${rise} .3s ease-out both`} style={{ animationDelay: "50ms" }}>
                    <Rubric colour={accentInk}>{nowHeading}</Rubric>
                    <NowSpinning
                        state={nowPlaying}
                        tint={tint}
                        accent={accentInk}
                        progress={playbackState?.data.interpolatedProgress ?? nowPlaying.progressNormal ?? 0}
                    />
                </Box>
            )}

            {pastWeekStats && (
                <Box animation={`${rise} .3s ease-out both`} style={{ animationDelay: "100ms" }}>
                    <Rubric colour={accentInk}>Past week</Rubric>

                    {/*
                      * A week with nothing in it gets the sentence and no tiles.
                      * Every figure would be zero, and a zero duration formats as
                      * an em dash — which at this size is a stray horizontal line
                      * sitting where the headline number should be.
                      */}
                    {!hasListened ? (
                        <Empty>{weekLine(pastWeekStats, isOwnProfile)}</Empty>
                    ) : (<>
                    {/*
                      * Bento rather than three equal columns: the tile that is
                      * twice the size says which figure matters without a word of
                      * explanation, and people look at the largest element on a
                      * screen first and longest.
                      */}
                    <Grid templateColumns="1.32fr 1fr" templateRows="auto auto" gap="9px">
                        <GridItem rowSpan={2}>
                            {/*
                              * Anchored top left rather than centred in the tile.
                              * The figure is the first thing on the page with any
                              * size to it, and centring it in a tall tile put it
                              * in the middle of nowhere — off the line the rest of
                              * the page is set to, and with its own label floating
                              * away from it. Reading starts at the top left corner,
                              * so that is where the number is; the space it leaves
                              * underneath is the tile giving the figure room rather
                              * than the tile being underfilled.
                              */}
                            <Stack
                                height="100%"
                                borderRadius={TILE_RADIUS}
                                background={SURFACE}
                                padding="18px"
                                justifyContent="flex-start"
                                alignItems="flex-start"
                                gap="7px"
                            >
                                <Figure
                                    value={pastWeekStats.totalListeningDuration}
                                    format={formatListening}
                                    size={{ base: "52px", sm: "60px" }}
                                    colour={accentInk}
                                />
                                <Text fontSize="13px" color={INK_DIM} lineHeight="1.35">
                                    spent listening
                                </Text>
                            </Stack>
                        </GridItem>

                        <GridItem>
                            <Stack borderRadius={TILE_RADIUS} background={SURFACE} padding="14px 16px" gap="4px" alignItems="flex-start">
                                {/*
                                  * The server counts a Set of song ids, so this is
                                  * how many different songs were played rather
                                  * than how many plays there were — which is what
                                  * the label used to claim.
                                  */}
                                <Figure
                                    value={pastWeekStats.uniqueSongsPlayedCount}
                                    format={v => `${Math.round(v)}`}
                                    size="28px"
                                    colour={INK}
                                />
                                <Text fontSize="12px" color={INK_DIM}>different songs</Text>
                            </Stack>
                        </GridItem>

                        <GridItem>
                            <Stack borderRadius={TILE_RADIUS} background={SURFACE} padding="14px 16px" gap="4px" alignItems="flex-start">
                                <Figure
                                    value={pastWeekStats.longestStreak}
                                    format={formatListening}
                                    size="28px"
                                    colour={INK}
                                />
                                <Text fontSize="12px" color={INK_DIM}>longest streak</Text>
                            </Stack>
                        </GridItem>
                    </Grid>

                    <Text fontSize="13.5px" color={INK_FAINT} lineHeight="1.5" marginTop="13px" maxWidth="38ch">
                        {weekLine(pastWeekStats, isOwnProfile)}
                    </Text>
                    </>)}
                </Box>
            )}

            <Box animation={`${rise} .3s ease-out both`} style={{ animationDelay: "150ms" }}>
                <Rubric
                    colour={accentInk}
                    action={
                        /*
                         * A switch rather than a tab bar. The three tabs it
                         * replaces were fixed at 40px each inside a 124px track
                         * with a 2px border, so the last one sat on the edge of
                         * its own box.
                         */
                        <HStack
                            gap="1px"
                            padding="2px"
                            borderRadius="full"
                            background={SURFACE}
                            flexShrink={0}
                            pointerEvents={topSongsLoading ? "none" : "all"}
                            role="tablist"
                            aria-label="Top songs period"
                        >
                            {TOP_SONG_PERIODS.map(period => {
                                const selected = (topSongsFilter === period.id);

                                return (
                                    <Center
                                        key={period.id}
                                        role="tab"
                                        aria-selected={selected}
                                        tabIndex={0}
                                        minWidth="40px"
                                        height="26px"
                                        paddingX="9px"
                                        borderRadius="full"
                                        cursor="pointer"
                                        userSelect="none"
                                        transition="background .2s, color .2s"
                                        background={selected ? accentInk : "transparent"}
                                        color={selected ? "#101013" : INK_FAINT}
                                        onClick={() => setTopSongsFilter(period.id)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter" || e.key === " ")
                                                setTopSongsFilter(period.id);
                                        }}
                                    >
                                        <Text fontSize="12.5px" fontWeight="bold">{period.label}</Text>
                                    </Center>
                                );
                            })}
                        </HStack>
                    }
                >
                    Top songs
                </Rubric>

                {topSongsLoading ? (
                    <TopSongSkeletons />
                ) : userTopSongs.length === 0 ? (
                    <Empty>
                        {topSongsFilter === "day"
                            ? "Nothing in the last 24 hours. Check back after a listen."
                            : "Nothing played in this stretch."}
                    </Empty>
                ) : (<>
                    {/*
                      * Ranked by position in the list rather than by the `index`
                      * the server sends. That index is assigned before songs with
                      * no cached metadata are dropped, so a missing track leaves a
                      * hole in it — and the page used to key its whole top songs
                      * section off finding index 0, which meant one uncached track
                      * hid the section entirely.
                      */}
                    <TopSongHero song={userTopSongs[0]} accent={accentInk} />
                    <Stack gap="15px">
                        {userTopSongs.slice(1).map((song, i) => (
                            <TopSongRow key={song.id + i} song={song} rank={i + 2} />
                        ))}
                    </Stack>
                </>)}
            </Box>

            {listenershipHistoryAvailable && (
                /*
                 * Simply the rest of the page.
                 *
                 * This section used to take the scroll over once it was 85%
                 * visible, become full screen, and hold itself in place with a
                 * setInterval calling scrollTo every 320ms while wheel and touch
                 * handlers tried to hand the scroll back. It fought the reader for
                 * control of the page, and it is the reason the profile felt
                 * broken to scroll. The feed pages itself as it comes into view,
                 * which is all it ever needed to do.
                 */
                <Box animation={`${rise} .3s ease-out both`} style={{ animationDelay: "200ms" }}>
                    <Rubric colour={accentInk}>Recently played</Rubric>
                    <FriendHistoryFeed
                        userId={profileId}
                        fetchHistory={(userId, page, forceRefresh) => user.getFriendProfileListenershipHistory(userId, page, forceRefresh)}
                        refreshSignal={`${nowPlaying?.songId ?? ""}:${historyRefreshTick}`}
                    />
                </Box>
            )}
        </Stack>
    </>);
}
