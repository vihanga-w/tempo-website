import { API_URL } from "@/lib/const";
import { getSizedImageUrl } from "@/lib/sized-img";
import User from "@/lib/usrlib";
import { Avatar, Box, Center, HStack, keyframes, Spinner, Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";

interface LeaderboardEntry {
    userId: string;
    displayName: string;
    imageUrl?: string;
    listeningMs: number;
    uniqueSongs: number;
    position: number;
    isViewer: boolean;
}

const rise = keyframes`
    from { transform: scaleY(0); opacity: 0; }
    to   { transform: scaleY(1); opacity: 1; }
`;

const slideIn = keyframes`
    from { transform: translateY(10px); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
`;

/**
 * A sheen crossing first place's picture.
 *
 * Loops seamlessly because the highlight is entirely outside the circle at both
 * ends — the frame at 100% is identical to the frame at 0%, so there is no jump
 * to hide. The travel finishes at 45% and holds, which gives a pause between
 * passes rather than a light that never stops moving.
 *
 * The distance is measured against the highlight's own width, so it has to
 * exceed the circle's: at 55% the band is a little over half the picture wide,
 * and 210% of that clears it completely at either end. Less, and a sliver of the
 * gradient sits on the edge through the pause.
 */
const sheen = keyframes`
    0%   { transform: translateX(-210%) skewX(-18deg); }
    45%  { transform: translateX(210%) skewX(-18deg); }
    100% { transform: translateX(210%) skewX(-18deg); }
`;

/**
 * Gold, silver and bronze, drawn rather than typed.
 *
 * The emoji medals render as three different objects depending on the platform —
 * different shapes, different ribbons, different weights — which on a podium of
 * three sitting side by side is the one place the inconsistency shows.
 */
const PLACING_COLOURS: { rim: string; highlight: string; edge: string; numeral: string }[] = [
    { rim: "#E3B341", highlight: "#F7DE93", edge: "#A97C22", numeral: "#4a370e" },
    { rim: "#C2C8D0", highlight: "#EDF1F5", edge: "#8C939C", numeral: "#33383f" },
    { rim: "#BE8355", highlight: "#DCA97E", edge: "#8A5A34", numeral: "#3d2413" },
];

/**
 * The placing, as a disc tucked against the picture it belongs to.
 *
 * Its outline is the page colour rather than a border, which cuts it away from
 * whatever it overlaps and keeps it legible against a light picture as well as a
 * dark one.
 */
function PlacingBadge({ position, size }: { position: number; size: number }) {
    const colours = PLACING_COLOURS[position - 1];

    if (!colours)
        return null;

    return (
        <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden>
            <circle cx="14" cy="14" r="12.2" fill={colours.rim} stroke="#0D0D0E" strokeWidth="3" />

            <text
                x="14"
                y="14.5"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="14"
                fontWeight="700"
                fontFamily="Inter, sans-serif"
                fill={colours.numeral}
            >
                {position}
            </text>
        </svg>
    );
}

/** "4h 12m", "38m", "—" — short enough to sit inside a row. */
function formatListening(ms: number): string {
    const minutes = Math.round(ms / 60e3);

    // Nothing at all reads as nothing, rather than as a very short something
    if (ms <= 0)
        return "—";

    if (minutes < 1)
        return "under a minute";

    if (minutes < 60)
        return `${minutes}m`;

    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * Counts a figure up when it first appears.
 *
 * A leaderboard that simply renders its numbers reads as a table. Watching the
 * total climb is most of what makes checking it feel like anything, and it costs
 * one animation frame loop.
 */
function useCountUp(target: number, durationMs = 900): number {
    const [value, setValue] = useState(0);
    const frame = useRef<number>();

    useEffect(() => {
        const start = performance.now();

        const step = (nowMs: number) => {
            const progress = Math.min(1, (nowMs - start) / durationMs);

            // Eases out, so it arrives rather than stopping dead
            setValue(target * (1 - Math.pow(1 - progress, 3)));

            if (progress < 1)
                frame.current = requestAnimationFrame(step);
        };

        frame.current = requestAnimationFrame(step);

        return () => {
            if (frame.current)
                cancelAnimationFrame(frame.current);
        };
    }, [target, durationMs]);

    return value;
}

/**
 * A line about where the reader stands.
 *
 * The gap to the person above is the part worth saying: a position on its own is
 * a fact, and how far off it is is a reason to press play. Nobody is told they
 * are last.
 */
function standingLine(entries: LeaderboardEntry[]): string {
    const me = entries.find(e => e.isViewer);

    if (!me)
        return "";

    if (entries.length === 1)
        return "Nobody to race yet — add a friend and see who listens more.";

    if (me.listeningMs === 0)
        return "You haven't listened this week. Press play and you're on the board.";

    if (me.position === 1) {
        const next = entries.find(e => !e.isViewer);
        const lead = (next ? me.listeningMs - next.listeningMs : 0);

        if (lead <= 0)
            return "You're tied for first. Somebody put a record on.";

        return `You're top by ${formatListening(lead)}. Hold it.`;
    }

    const above = [...entries].reverse().find(e => e.listeningMs > me.listeningMs);

    if (!above)
        return `You're in ${me.position}${me.position === 2 ? "nd" : me.position === 3 ? "rd" : "th"} place.`;

    return `${formatListening(above.listeningMs - me.listeningMs)} behind ${above.displayName}.`;
}

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
    // Second, first, third — the shape a podium actually is
    const order = [entries[1], entries[0], entries[2]].filter(Boolean);
    const heights: { [position: number]: string } = { 1: "92px", 2: "68px", 3: "54px" };

    return (
        <HStack align="stretch" justify="center" gap="10px" mb="8" mt="2">
            {order.map(entry => {
                const isFirst = entry.position === 1;

                return (
                    <Stack key={entry.userId} align="center" justify="flex-end" gap="0" flex="1" maxW="120px">
                        {/*
                          * The columns stretch to a common height and everything
                          * above the bar is pushed to the bottom of the space
                          * left over, so the bars sit on one line and differ only
                          * in how far up they reach. A fixed height here instead
                          * let the taller first-place column overflow and squash
                          * the bars to nothing.
                          */}
                        <Stack align="center" justify="flex-end" gap="5px" flex="1" pb="2">
                            {/*
                              * The clip that keeps the sheen inside the circle would
                              * take the medal with it, so the medal hangs from this
                              * outer box instead and only the picture is clipped.
                              */}
                            <Box position="relative" flexShrink={0} mb="2">
                                {/*
                                  * The rim carries the placing, so the colour says it
                                  * before the number is read. Nothing marks the reader
                                  * here — the label under the picture already says
                                  * "You", and a second ring would compete with the
                                  * placing colour for the same edge.
                                  */}
                                <Box
                                    position="relative"
                                    borderRadius="full"
                                    overflow="hidden"
                                    border={`3px solid ${PLACING_COLOURS[entry.position - 1]?.rim ?? "transparent"}`}
                                >
                                    <Avatar
                                        size={isFirst ? "lg" : "md"}
                                        name={entry.displayName}
                                        src={entry.imageUrl ? getSizedImageUrl(entry.imageUrl, 96, 96) : undefined}
                                    />

                                    {isFirst && (
                                        <Box
                                            position="absolute"
                                            top="0"
                                            bottom="0"
                                            left="0"
                                            width="55%"
                                            pointerEvents="none"
                                            sx={{
                                                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.42) 50%, transparent 100%)",
                                                animation: `${sheen} 3.4s linear infinite`,
                                            }}
                                        />
                                    )}
                                </Box>

                                <Box
                                    position="absolute"
                                    right="-3px"
                                    bottom="-1px"
                                    pointerEvents="none"
                                >
                                    <PlacingBadge position={entry.position} size={isFirst ? 28 : 23} />
                                </Box>
                            </Box>

                            <Text
                                fontSize="13px"
                                fontWeight="semibold"
                                color="#f5f5f5"
                                noOfLines={1}
                                maxW="100%"
                                textAlign="center"
                            >
                                {entry.isViewer ? "You" : entry.displayName}
                            </Text>

                            <Text fontSize="12px" color="#a0a0a0">
                                {formatListening(entry.listeningMs)}
                            </Text>
                        </Stack>

                        <Box
                            width="100%"
                            flexShrink={0}
                            height={heights[entry.position] ?? "50px"}
                            borderTopRadius="10px"
                            transformOrigin="bottom"
                            bg={isFirst ? "#3a2b5c" : "#1c1c1e"}
                            sx={isFirst ? {
                                backgroundImage: "linear-gradient(160deg, #4a3670 0%, #33265180 100%)",
                                animation: `${rise} .5s ease-out`,
                            } : {
                                animation: `${rise} .5s ease-out`,
                            }}
                        >
                            <Center height="100%">
                                <Text fontSize="22px" fontWeight="bold" color={isFirst ? "#f5f5f5" : "#5a5a5a"}>
                                    {entry.position}
                                </Text>
                            </Center>
                        </Box>
                    </Stack>
                );
            })}
        </HStack>
    );
}

function Row({ entry, leader, index }: { entry: LeaderboardEntry; leader: number; index: number }) {
    const counted = useCountUp(entry.listeningMs);
    const share = (leader > 0 ? Math.max(0.02, entry.listeningMs / leader) : 0);

    return (
        <Box
            position="relative"
            overflow="hidden"
            borderRadius="12px"
            border={entry.isViewer ? "1px solid #4a3a70" : "1px solid #1e1e1e"}
            bg={entry.isViewer ? "#17141f" : "#131313"}
            px="4"
            py="3"
            // Staggered, so the board assembles rather than appearing
            animation={`${slideIn} .35s ease-out both`}
            style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
        >
            {/* How far along they are relative to the leader */}
            <Box
                position="absolute"
                left="0"
                top="0"
                bottom="0"
                width={`${share * 100}%`}
                bg={entry.isViewer ? "#251d38" : "#191919"}
                transition="width .8s ease-out"
            />

            <HStack position="relative" gap="12px">
                <Text
                    fontSize="15px"
                    fontWeight="bold"
                    color={entry.isViewer ? "#c4a8ff" : "#6b6b6b"}
                    minW="24px"
                >
                    {entry.position}
                </Text>

                {/*
                  * Off the podium there is no placing colour on the picture, so
                  * this is where the reader's own ring earns its place.
                  */}
                <Box
                    borderRadius="full"
                    flexShrink={0}
                    border={entry.isViewer ? "2px solid #c4a8ff" : "2px solid transparent"}
                >
                    <Avatar
                        size="sm"
                        name={entry.displayName}
                        src={entry.imageUrl ? getSizedImageUrl(entry.imageUrl, 64, 64) : undefined}
                    />
                </Box>

                <Stack gap="0" flex="1" minW="0">
                    <Text fontSize="15px" fontWeight="semibold" color="#f5f5f5" noOfLines={1}>
                        {entry.isViewer ? "You" : entry.displayName}
                    </Text>
                    <Text fontSize="12px" color="#6b6b6b">
                        {entry.uniqueSongs === 0
                            ? "nothing yet this week"
                            : `${entry.uniqueSongs} song${entry.uniqueSongs === 1 ? "" : "s"}`}
                    </Text>
                </Stack>

                <Text fontSize="15px" fontWeight="semibold" color={entry.isViewer ? "#c4a8ff" : "#a0a0a0"}>
                    {formatListening(counted)}
                </Text>
            </HStack>
        </Box>
    );
}

/**
 * This week's listening, ranked among friends.
 *
 * Reads as a scoreboard rather than a table: a podium for the top three, a bar
 * behind each row showing how far along they are against the leader, and the
 * reader's own row picked out wherever it lands.
 */
export default function LeaderboardPage({ user }: { user: User }) {
    const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
    const [error, setError] = useState<string>("");

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const req = await fetch(API_URL + "/me/leaderboard", {
                    headers: { ...(user.getAuthHeaders()) },
                    credentials: "include",
                });

                const res = await req.json() as {
                    error: boolean;
                    message?: string;
                    data?: { entries: LeaderboardEntry[] };
                };

                if (cancelled)
                    return;

                if (res.error || !res.data) {
                    setError(res.message ?? "Couldn't load the leaderboard.");

                    return;
                }

                setEntries(res.data.entries);
            } catch {
                if (!cancelled)
                    setError("Couldn't reach Tempo. Check your connection and try again.");
            }
        })();

        return () => { cancelled = true; };
    }, [user]);

    // Centred the way the other pages centre theirs: filling the viewport rather
    // than a fraction of it. A percentage of the height puts the middle of that
    // fraction on screen, which is not the middle of anything the reader can see.
    if (error !== "") {
        return (
            <Center position="absolute" top="0" left="0" width="100vw" height="100vh" px="8">
                <Text fontSize="15px" color="#ff8a8a" textAlign="center">{error}</Text>
            </Center>
        );
    }

    if (!entries) {
        // The spinner the other pages wait behind. Loader is the full screen
        // logo the app opens with, and using it here reads as the app starting
        // up again rather than as a page fetching its contents.
        return (
            <Center position="absolute" top="0" left="0" width="100vw" height="100vh">
                <Spinner size="lg" />
            </Center>
        );
    }

    const podium = entries.slice(0, 3);
    const rest = entries.slice(3);
    const leader = entries[0]?.listeningMs ?? 0;

    return (
        // Full width with the same padding the other pages use. Capping the
        // column and centring it left the board narrower than the header above
        // it and pushed off to one side of it.
        <Box px="20px" pb="24">
            <Stack gap="1" mb="5" mt="2">
                <Text fontSize="26px" fontWeight="bold" color="#f5f5f5">
                    This week
                </Text>
                <Text fontSize="15px" color="#a0a0a0" lineHeight="1.5">
                    {standingLine(entries)}
                </Text>
            </Stack>

            {podium.length > 0 && <Podium entries={podium} />}

            <Stack gap="8px">
                {rest.map((entry, i) => (
                    <Row key={entry.userId} entry={entry} leader={leader} index={i} />
                ))}
            </Stack>

            {/*
              * A rolling window rather than a weekly reset: the board is the last
              * seven days from whenever it is read, so saying it resets would be
              * describing something it does not do.
              */}
            <Text fontSize="12px" color="#4a4a4a" textAlign="center" mt="5">
                Last 7 days · counts time listened
            </Text>
        </Box>
    );
}
