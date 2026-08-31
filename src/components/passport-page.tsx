"use client";

import { API_URL } from "@/lib/const";
import User from "@/lib/usrlib";
import { Box, Center, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { keyframes } from "@emotion/react";
import PassportGlobe, {
    GlobePin, GLOBE_RADIUS_RATIO, GLOBE_CENTRE_DROP_RATIO,
} from "./passport-globe";
import PassportStamp from "./passport-stamp";
import { useCountUp } from "@/lib/use-count-up";

/**
 * Where your music comes from, and one place a week to go next.
 *
 * The page is four bands. The destination leads because it is the only part
 * that changes weekly and the only part worth a notification. The stamps are the
 * record underneath it. "Close to" is third and is the most important element
 * here: it is the only one that works on the first day, when there is nothing
 * to show yet, and it turns an empty page into a specific next action.
 *
 * The globe is fixed to the bottom edge and drawn larger than the screen, so it
 * reads as a horizon rather than a ball. Content dissolves into it along its own
 * curve — a straight-edged fade against a curved horizon reads as a seam.
 */

const INK = "#E9E7FB";
const ACCENT = "#A480FF";
const GOLD = "#E3B341";
const PAGE_BG = "#0D0D0E";

/** Height of the globe band. */
const GLOBE_HEIGHT = 226;

/** How far above the sphere's rim the scrim has finished fading. */
const SCRIM_FADE = 132;

const slideIn = keyframes`
    from { transform: translateY(10px); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
`;

interface Stamp {
    countryCode: string;
    name: string;
    lat: number;
    lon: number;
    continent: string;
    month: string;
    earnedAt: number;
}

interface CountryEntry {
    countryCode: string;
    name: string;
    lat: number;
    lon: number;
    continent: string;
    stampCount: number;
    firstAt: number;
    lastAt: number;
}

interface CloseTo {
    countryCode: string;
    name: string;
    have: number;
    need: number;
    path: "artists" | "days";
}

interface DestinationPayload {
    countryCode: string;
    name: string;
    lat: number;
    lon: number;
    why: string;
    bridge: { artistId: string; name: string };
    fresh: { artistId: string; name: string }[];
}

interface PassportPayload {
    passport: {
        stamps: Stamp[];
        countries: CountryEntry[];
        totalStamps: number;
        totalCountries: number;
        closeTo: CloseTo[];
        unplacedPlays: number;
        placedPlays: number;
    };
    destination: DestinationPayload | null;
    pendingArtists: number;
}

/**
 * The perceptual falloff from artwork-wash, run around the globe.
 *
 * Concentric with the sphere rather than a straight line down the page, so text
 * disappears along the curve of the horizon it is disappearing behind: earlier
 * in the middle where the globe bulges up, later at the edges. Eighteen stops,
 * smoothstepped so neither end has a corner, then cubed to undo the eye's
 * cube-root response — a three-stop fade over a dark ground bands visibly.
 */
function globeGeometry(width: number, screenHeight: number): { scrim: string; clearance: number } {
    const R = width * GLOBE_RADIUS_RATIO;
    const cx = width / 2;
    // The sphere's centre sits below the bottom of the screen
    const cy = screenHeight + (R * GLOBE_CENTRE_DROP_RATIO);
    const outer = R + SCRIM_FADE;
    const inner = (R / outer) * 100;

    const stops = [`${PAGE_BG} 0%`, `${PAGE_BG} ${inner.toFixed(2)}%`];

    for (let i = 1; i <= 18; i++) {
        const t = i / 18;
        const eased = t * t * (3 - 2 * t);
        const alpha = Math.pow(1 - eased, 3);

        stops.push(`rgba(13,13,14,${alpha.toFixed(4)}) ${(inner + (100 - inner) * t).toFixed(2)}%`);
    }

    /*
     * How much room the page has to leave at its foot.
     *
     * The globe's band is 226 tall, but the scrim is what actually hides
     * things and it reaches much further up: the sphere is centred below the
     * screen, so a point h above the bottom is (h + drop) from the centre and
     * stays fully covered until that passes R, and partly covered until it
     * passes R + the fade. Measured down the middle, where the globe bulges
     * highest and the scrim therefore reaches highest.
     *
     * Padding short of this does not merely crowd the last item, it makes it
     * unreachable: no amount of scrolling can lift it into clear air.
     */
    const clearance = Math.max(
        GLOBE_HEIGHT,
        Math.ceil(R + SCRIM_FADE - (R * GLOBE_CENTRE_DROP_RATIO)),
    );

    return {
        scrim: `radial-gradient(circle ${outer.toFixed(1)}px at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, ${stops.join(",")})`,
        clearance,
    };
}

/** Says nothing is here yet, and what would put something here. */
function Empty({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <Text
            fontSize="14px"
            color="#4A4A4A"
            lineHeight="1.55"
            paddingY="10px"
            // Explicit, for the reason the leaderboard gives for its own width:
            // left to itself this is sized by its contents. The 34ch measure it
            // was copied from belongs to the profile's narrow column, and here
            // it left the text at about two thirds of the screen.
            width="100%"
        >
            {children}
        </Text>
    );
}

/** What is left to do, in words. Shared by the destination card and the nudges. */
function nudgeWording(entry: CloseTo): string {
    const left = entry.need - entry.have;

    if (entry.path === "artists") {
        return left === 1
            ? `One more artist and ${entry.name} is yours.`
            : `${left} more artists from ${entry.name}.`;
    }

    return left === 1
        ? `One more day with them and ${entry.name} is yours.`
        : `${left} more days and ${entry.name} is yours.`;
}

/** The sentence and the bar under it, for the destination card. */
function Progress({ entry }: { entry: CloseTo }) {
    const share = Math.max(0.04, entry.have / entry.need);

    return (
        <Box mt="11px">
            <HStack justify="space-between" mb="7px" gap="8px">
                <Text fontSize="11.5px" color="#8B8B8B" noOfLines={1}>
                    {nudgeWording(entry)}
                </Text>
                <Text
                    fontSize="11px"
                    color={ACCENT}
                    fontFamily="'IBM Plex Mono', monospace"
                    flexShrink={0}
                >
                    {entry.have} of {entry.need}
                </Text>
            </HStack>

            <Box height="4px" borderRadius="4px" bg="#232326" overflow="hidden">
                <Box
                    height="100%"
                    width={`${share * 100}%`}
                    bg={ACCENT}
                    borderRadius="4px"
                    transition="width .8s ease-out"
                />
            </Box>
        </Box>
    );
}

function NudgeRow({ entry, index }: { entry: CloseTo; index: number }) {
    const share = Math.max(0.04, entry.have / entry.need);
    const wording = nudgeWording(entry);

    return (
        <Box
            borderRadius="12px"
            border="1px solid #1E1E1E"
            bg="#131313"
            px="13px"
            py="12px"
            animation={`${slideIn} .35s ease-out both`}
            style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
        >
            <HStack justify="space-between" mb="8px" gap="8px">
                <Text fontSize="13px" fontWeight="semibold" color="#F5F5F5" noOfLines={1}>
                    {entry.name}
                </Text>
                <Text fontSize="11px" color={ACCENT} fontFamily="'IBM Plex Mono', monospace" flexShrink={0}>
                    {entry.have} of {entry.need}
                </Text>
            </HStack>

            <Box height="4px" borderRadius="4px" bg="#232326" overflow="hidden" mb="8px">
                <Box
                    height="100%"
                    width={`${share * 100}%`}
                    bg={ACCENT}
                    borderRadius="4px"
                    transition="width .8s ease-out"
                />
            </Box>

            <Text fontSize="11.5px" color="#6B6B6B">{wording}</Text>
        </Box>
    );
}

export default function PassportPage({ user }: Readonly<{ user: User }>) {
    const [data, setData] = useState<PassportPayload | null>(null);
    const [error, setError] = useState<string>("");
    const [globe, setGlobe] = useState<{ scrim: string; clearance: number }>(
        { scrim: "", clearance: GLOBE_HEIGHT },
    );

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const req = await fetch(API_URL + "/me/passport", {
                    headers: { ...(user.getAuthHeaders()) },
                    credentials: "include",
                });

                const res = await req.json() as {
                    error: boolean;
                    message?: string;
                    data?: PassportPayload;
                };

                if (cancelled)
                    return;

                if (res.error || !res.data) {
                    setError(res.message ?? "Couldn't load your passport.");

                    return;
                }

                setData(res.data);
            } catch {
                if (!cancelled)
                    setError("Couldn't reach Tempo. Check your connection and try again.");
            }
        })();

        return () => { cancelled = true; };
    }, [user]);

    // The scrim's geometry follows the viewport, so it is measured rather than
    // guessed and recomputed when the window changes.
    useEffect(() => {
        const measure = () => setGlobe(globeGeometry(window.innerWidth, window.innerHeight));

        measure();
        window.addEventListener("resize", measure);

        return () => window.removeEventListener("resize", measure);
    }, []);

    const pins: GlobePin[] = useMemo(
        () => (data?.passport.countries ?? []).map(c => ({
            lat: c.lat, lon: c.lon, weight: c.stampCount,
        })),
        [data],
    );

    const target = useMemo(
        () => (data?.destination
            ? { lat: data.destination.lat, lon: data.destination.lon }
            : (data?.passport.countries[0]
                ? { lat: data.passport.countries[0].lat, lon: data.passport.countries[0].lon }
                : null)),
        [data],
    );

    /*
     * The destination is chosen from countries you have brushed against, which
     * is exactly what Close to lists, so the two bands would otherwise open with
     * the same country twice — once as somewhere to go and again as somewhere
     * you nearly have. The card above says it better, so the nudge stands down.
     */
    /*
     * How close they already are to the place being suggested.
     *
     * Filtering the destination out of Close to stopped the page opening two
     * bands with the same country, but it also threw away the one thing the
     * card could not say: that France is one artist away from being stamped.
     * That is the most actionable line on the page, so it moves onto the card
     * rather than disappearing with the row.
     */
    const destinationProgress = useMemo(
        () => (data?.passport.closeTo ?? []).find(
            entry => entry.countryCode === data?.destination?.countryCode,
        ) ?? null,
        [data],
    );

    const closeTo = useMemo(
        () => (data?.passport.closeTo ?? []).filter(
            entry => entry.countryCode !== data?.destination?.countryCode,
        ),
        [data],
    );

    const stampCount = useCountUp(data?.passport.totalStamps ?? 0);

    if (error !== "") {
        return (
            <Center position="absolute" top="0" left="0" width="100vw" height="100vh" px="8">
                <Text fontSize="15px" color="#ff8a8a" textAlign="center">{error}</Text>
            </Center>
        );
    }

    if (!data) {
        return (
            <Center position="absolute" top="0" left="0" width="100vw" height="100vh">
                <Spinner size="lg" />
            </Center>
        );
    }

    const { passport, destination, pendingArtists } = data;

    return (
        <>
            {/*
              * Order matters, and it is the opposite of the obvious one. The
              * scrim is opaque inside the sphere's radius -- that is how the
              * text dissolves -- so the globe has to be painted on top of it or
              * the page colour covers the world. The canvas is transparent
              * outside the sphere, so the scrim still shows through above it.
              */}
            <Box
                position="fixed"
                inset="0"
                zIndex={2}
                pointerEvents="none"
                background={globe.scrim}
            />

            <PassportGlobe
                pins={pins}
                target={target}
                height={GLOBE_HEIGHT}
                pinColour={ACCENT}
                targetColour={GOLD}
            />

            <Box
                width="100%"
                px="20px"
                position="relative"
                zIndex={1}
                paddingBottom={`${globe.clearance}px`}
            >
                {destination && (
                    <Box
                        mb="22px"
                        mt="2"
                        borderRadius="14px"
                        border="1px solid #2A2340"
                        bg="#17141F"
                        px="15px"
                        py="14px"
                    >
                        <HStack align="flex-start" gap="12px" mb="9px">
                            <Box flex="1" minW="0">
                                <HStack gap="8px" mb="9px">
                                    <Text
                                        fontFamily="'IBM Plex Mono', monospace"
                                        fontSize="9.5px"
                                        letterSpacing="0.14em"
                                        textTransform="uppercase"
                                        color={GOLD}
                                    >
                                        Next destination
                                    </Text>
                                    <Text
                                        fontFamily="'IBM Plex Mono', monospace"
                                        fontSize="9.5px"
                                        color="#4A4A4A"
                                    >
                                        this week
                                    </Text>
                                </HStack>

                                <Text
                                    fontFamily="Libre Franklin"
                                    fontWeight="black"
                                    fontStyle="italic"
                                    fontSize="25px"
                                    lineHeight="1"
                                    letterSpacing="-0.02em"
                                    color="#F5F5F5"
                                    mb="9px"
                                >
                                    {destination.name}
                                </Text>

                                <Text fontSize="12.5px" lineHeight="1.5" color="#A0A0A0">
                                    {destination.why}
                                </Text>
                            </Box>

                            {/*
                              * The impression they would collect, pressed into the
                              * corner of the card that is offering it. It used to
                              * sit in the stamp grid, where it was counted by eye
                              * as a sixth stamp under a heading that said five --
                              * and where it was, plainly, not one.
                              */}
                            <Box flexShrink={0} width="78px" mt="2px">
                                <PassportStamp
                                    countryCode={destination.countryCode}
                                    countryName={destination.name}
                                    earnedAt={0}
                                    colour={GOLD}
                                />
                            </Box>
                        </HStack>

                        <HStack flexWrap="wrap" gap="5px">
                            <Text
                                fontSize="11px"
                                px="8px"
                                py="3px"
                                borderRadius="full"
                                border={`1px solid ${ACCENT}8C`}
                                color={ACCENT}
                                whiteSpace="nowrap"
                            >
                                {destination.bridge.name}
                            </Text>

                            {destination.fresh.map(artist => (
                                <Text
                                    key={artist.artistId}
                                    fontSize="11px"
                                    px="8px"
                                    py="3px"
                                    borderRadius="full"
                                    border="1px solid #2E2E33"
                                    color="#C9C6D6"
                                    whiteSpace="nowrap"
                                >
                                    {artist.name}
                                </Text>
                            ))}
                        </HStack>

                        {destinationProgress && <Progress entry={destinationProgress} />}
                    </Box>
                )}

                <Box mb="22px">
                    <Text fontSize="15px" fontWeight="bold" color="#F5F5F5" mb="3px">
                        Your stamps
                    </Text>
                    <Text fontSize="12.5px" color="#6B6B6B" lineHeight="1.45">
                        {passport.totalStamps === 0
                            ? "Nothing stamped yet."
                            : `${Math.round(stampCount)} stamp${passport.totalStamps === 1 ? "" : "s"} `
                              + `across ${passport.totalCountries} `
                              + `countr${passport.totalCountries === 1 ? "y" : "ies"}`}
                    </Text>

                    {passport.totalStamps === 0 ? (
                        <Empty>
                            A country is stamped once you have played three of its artists,
                            or one of them on three separate days.
                            {pendingArtists > 0
                                ? " Tempo is still working out where your music comes from."
                                : ""}
                        </Empty>
                    ) : (
                        <Box
                            display="grid"
                            gridTemplateColumns="repeat(3, 1fr)"
                            gap="11px 8px"
                            mt="12px"
                        >
                            {passport.countries.map(country => (
                                <PassportStamp
                                    key={country.countryCode}
                                    countryCode={country.countryCode}
                                    countryName={country.name}
                                    earnedAt={country.lastAt}
                                    colour={ACCENT}
                                    count={country.stampCount}
                                />
                            ))}
                        </Box>
                    )}
                </Box>

                {closeTo.length > 0 && (
                    <Box mb="22px">
                        <Text fontSize="15px" fontWeight="bold" color="#F5F5F5" mb="3px">
                            Close to
                        </Text>
                        <Text fontSize="12.5px" color="#6B6B6B" mb="10px">
                            {closeTo.length === 1
                                ? "One country is nearly yours."
                                : `${closeTo.length} countries are nearly yours.`}
                        </Text>

                        <Stack gap="8px">
                            {closeTo.map((entry, i) => (
                                <NudgeRow key={entry.countryCode} entry={entry} index={i} />
                            ))}
                        </Stack>
                    </Box>
                )}

                {/*
                  * Said out loud rather than hidden. A map that silently omits a
                  * third of somebody's listening is lying by omission, and while
                  * origins are still resolving that is exactly what it is doing.
                  */}
                {(pendingArtists > 0 || passport.unplacedPlays > 0) && (
                    <Text fontSize="12px" color="#4A4A4A" textAlign="center" mt="4">
                        {pendingArtists > 0
                            ? `Still placing ${pendingArtists} artist${pendingArtists === 1 ? "" : "s"}`
                            : `${passport.unplacedPlays} play${passport.unplacedPlays === 1 ? "" : "s"} couldn't be placed`}
                    </Text>
                )}
            </Box>
        </>
    );
}
