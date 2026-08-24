import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import User, { ClientUserAccount } from "@/lib/usrlib";
import { Box, Center, chakra, Grid, GridItem, HStack, Skeleton, Spinner, Stack, Text } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useFitText } from "@/lib/use-fit-text";
import { useFitLines } from "@/lib/use-fit-lines";
import { useTurntable } from "@/lib/use-turntable";
import { grooveRingsFor, separationsFor } from "@/lib/record-grooves";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { getSpotifyDeeplink, SkeletonImage } from "./playback-state";
import {
    chipFill,
    extractArtworkColour,
    extractArtworkPalette,
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
import { shortName, weekLine } from "@/lib/profile-copy";
import { useListeningFact } from "@/lib/listening-facts";
import { useCountUp } from "@/lib/use-count-up";
import { FaCog, FaHistory } from "react-icons/fa";
import { Recap } from "./recap-drawer";
import FriendHistoryFeed from "./friend-history-feed";
import { InitialAvatar } from "./initial-avatar";
import { ArtworkWash } from "./artwork-wash";

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
/** Points along a count-up to measure, about one per frame it will draw. */
const SAMPLES = 60;

function Figure({
    value,
    format,
    size,
    colour,
    floor = 0,
}: Readonly<{
    value: number;
    format: (value: number) => string;
    size: string | Record<string, string>;
    colour: string;
    /**
     * Value to start the count at, in whatever units this figure is counting.
     *
     * Only for figures whose formatter has a wording it falls back to below
     * some threshold — a length of listening reads as "under a minute" before
     * it reads as a number. A plain tally has no such floor and counts from
     * zero, which is the default; setting one here would pin it to its own
     * total and it would never appear to count at all.
     */
    floor?: number;
}>) {
    const counted = useCountUp(value);
    const ref = useRef<HTMLParagraphElement>(null);
    const probeRef = useRef<HTMLSpanElement>(null);

    /*
     * Fitted against the widest reading the count will pass through, which is
     * not always the one it lands on: a total of seventy hours settles at
     * "70h 0m" but climbs there through "69h 59m", a digit wider. Sizing to the
     * destination alone leaves those frames clipped on the way past.
     *
     * Sampled rather than reasoned about, so this holds for any formatter it is
     * given rather than for the one it happens to be used with today.
     */
    const widest = useMemo(() => {
        const from = Math.min(value, floor);

        let longest = format(value);

        for (let step = 0; step <= SAMPLES; step++) {
            const at = format(from + ((value - from) * step) / SAMPLES);

            if (at.length > longest.length)
                longest = at;
        }

        return longest;
    }, [format, value, floor]);

    useFitText(ref, probeRef, widest);

    /*
     * A length of listening climbing from zero passes through "—" and "under a
     * minute" before it reaches a figure. Both are far wider than the number
     * they precede, so the first frames of the page were the widest thing on
     * it. Starting at the floor skips them.
     */
    const shown = Math.max(counted, Math.min(value, floor));

    return (
        <Text
            ref={ref}
            fontFamily="Inter"
            fontWeight="800"
            fontSize={size}
            lineHeight="1"
            letterSpacing="-0.04em"
            sx={{ fontVariantNumeric: "tabular-nums" }}
            color={colour}
            whiteSpace="nowrap"
            maxWidth="100%"
            overflow="hidden"
            position="relative"
            /*
              * Colour only. Transitioning font-size makes the computed value
              * mid-animation rather than settled, so the fit measures against a
              * size the text is only passing through and never converges.
              */
            transition="color .45s"
        >
            {format(shown)}

            {/*
              * Inherits the figure's font, so it measures as the real thing
              * while never being seen or read aloud.
              */}
            <chakra.span
                ref={probeRef}
                aria-hidden="true"
                position="absolute"
                visibility="hidden"
                whiteSpace="nowrap"
                pointerEvents="none"
                left="0"
                top="0"
            >
                {widest}
            </chakra.span>
        </Text>
    );
}


/*
 * A 12" LP, in proportion.
 *
 * Every radius below is the real one, written as a fraction of the record's own
 * radius — 151mm on a 302mm disc — so what is drawn is a specific object rather
 * than a dark circle with rings on it:
 *
 *     spindle hole    7.24mm across            2.4%
 *     label            100mm across           33.1%
 *     dead wax        out to 120mm            39.7%   smooth, silent
 *     music           120mm to 292mm     39.7–96.7%
 *     lead-in         292mm to the edge       96.7%   smooth, silent
 *
 * The one thing not to scale is the groove pitch. Microgroove is cut at 300 to
 * 400 grooves per inch, which across that music band is upwards of three
 * thousand turns of a single continuous spiral — about a thirtieth of a pixel
 * each at the size this is drawn. Rendered honestly they average out to a flat
 * grey ring, so the pitch is exaggerated until it reads as grooves. Concentric
 * circles stand in for the spiral, which at any visible scale is the same
 * picture.
 */
const SPINDLE = 2.4;
const LABEL = 37.7;
const MUSIC_INNER = 39.7;
const MUSIC_OUTER = 96.7;

/*
 * The wax.
 *
 * PVC is clear; a record is black because of carbon black, and only about 0.2%
 * of it by weight. Carbon black reflects 5–10% of the light that hits it — but
 * that is its *diffuse* reflectance, and a record is glossy, so nearly all of
 * what you see coming off one is specular: the room, reflected. The material
 * underneath that is very close to black.
 *
 * This was too light because the wax was doing the job the sheen should be
 * doing. Darker here, with the highlight left to lift it.
 */
const VINYL = "#08080b";

/**
 * How much of the light the grooves are throwing back, around the disc.
 *
 * Used as a mask on the ring pattern rather than painted over the vinyl, so it
 * modulates the grooves instead of washing the whole face. Never reaches zero —
 * the banding is always there, it just catches more at two points than it does
 * between them.
 *
 * Two lobes, opposed, because that is what a single light source does to a
 * circular groove: one bright arc either side of the centre. Four of them came
 * round twice as often and read as a flicker rather than as a surface turning.
 */
const GROOVE_GLINT = `conic-gradient(from 0deg at 50% 50%, ${[0, 180]
    .map(at => `rgba(0,0,0,0.66) ${at}deg, rgba(0,0,0,1) ${at + 48}deg, rgba(0,0,0,0.66) ${at + 96}deg`)
    .join(", ")}, rgba(0,0,0,0.66) 360deg)`;



/** The mottle in the vinyl. Coarser than the wash's grain, so it survives being
 * seen through a 39px crescent, and drawn once at module scope. */
const PRESSING_GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>` +
    `<filter id='v'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='0.55' numOctaves='1' stitchTiles='stitch'/>` +
    `<feColorMatrix type='saturate' values='0'/>` +
    `</filter>` +
    `<rect width='100%' height='100%' filter='url(#v)'/>` +
    `</svg>`,
)}")`;

/**
 * Sizes a song title may be set at, largest first.
 *
 * Steps rather than a free scale, so a long title still looks like it belongs to
 * the same panel as a short one. Module scope because the fitting hook keys off
 * this array, and a fresh one on every render would re-measure forever.
 */
const TITLE_SIZES = [19, 17.5, 16] as const;

/** Same colour, not merely the same object. */
function sameRgb(a: Rgb | null, b: Rgb | null): boolean {
    if (a === b)
        return true;

    return (!!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b);
}

/*
 * The page's colour change, in two halves.
 *
 * A gradient cannot be transitioned — background-image does not interpolate —
 * so the wash is faded out on its opacity, swapped while it cannot be seen, and
 * faded back in. Which means these two numbers and the timers that swap the
 * colour have to agree: the swap has to land after the fade out has finished.
 *
 * They did not. The fade ran for 750ms and the swap happened at 230ms, so the
 * gradient was still better than half visible when it changed underneath — the
 * cross-fade was hiding a cut rather than avoiding one.
 *
 * Out is quicker than in: leaving is not the part worth watching.
 */
const ACCENT_FADE_OUT = 200;
const ACCENT_FADE_IN = 420;

function Record({ size, offset, playing, label, palette, songId, elapsedMs }: Readonly<{ size: number; offset: number; playing: boolean; label: string; palette: string[]; songId: string; elapsedMs: number }>) {
    const platter = useTurntable(playing, elapsedMs);

    /*
     * Which record is currently out of the sleeve.
     *
     * Held separately from the track that is playing, because the two are not
     * the same thing for the third of a second it takes to change them over: the
     * new track is already playing while the old record is still sliding away.
     */
    const [sleeved, setSleeved] = useState(songId);
    const [changing, setChanging] = useState(false);

    useEffect(() => {
        if (songId === sleeved)
            return;

        setChanging(true);

        // Swapped at the far end of the slide, while the disc is behind the
        // sleeve — the grooves and the label change where they cannot be seen to
        const swap = setTimeout(() => {
            setSleeved(songId);
            setChanging(false);
        }, 280);

        return () => clearTimeout(swap);
    }, [songId, sleeved]);

    // Keyed on the record that is out, not the one that is playing, so the
    // grooves do not rearrange themselves mid-slide
    const separations = useMemo(
        () => separationsFor(sleeved, MUSIC_INNER, MUSIC_OUTER),
        [sleeved],
    );

    /*
     * The groove banding, as one gradient of unevenly spaced rings.
     *
     * Built rather than repeated: each ring is a thin light line with the wax
     * between, and the gaps are all slightly different widths.
     */
    /*
     * The printed face of the label, with the spindle hole punched through it.
     *
     * Listed hole-first because CSS paints the first background layer on top.
     * A single accent when the sleeve gave up no palette — a black and white
     * cover gets a plain label rather than invented colours, same as the wash.
     */
    const labelFill = useMemo(() => {
        const hole = (SPINDLE / LABEL) * 100;

        const punch = `radial-gradient(circle closest-side at 50% 50%, #08080a 0 ${hole.toFixed(1)}%, transparent ${(hole + 1.2).toFixed(1)}%)`;

        const face = (palette.length > 1
            ? `linear-gradient(118deg, ${palette.join(", ")})`
            : `linear-gradient(118deg, ${palette[0] ?? label}, ${palette[0] ?? label})`);

        return `${punch}, ${face}`;
    }, [palette, label]);

    const grooves = useMemo(() => {
        const rings = grooveRingsFor(sleeved, MUSIC_INNER, MUSIC_OUTER);

        // Half the thickness of a groove line, as a share of the radius. At
        // 0.34 the lines came out under half a pixel and read as a haze
        const HALF = 1.0;

        const stops = rings.flatMap(at => [
            `transparent ${(at - HALF).toFixed(2)}%`,
            `rgba(255,255,255,0.085) ${(at - HALF).toFixed(2)}%`,
            `rgba(255,255,255,0.085) ${(at + HALF).toFixed(2)}%`,
            `transparent ${(at + HALF).toFixed(2)}%`,
        ]);

        return `transparent 0%, ${stops.join(", ")}, transparent 100%`;
    }, [sleeved]);

    const circle = (stops: string) => `radial-gradient(circle closest-side at 50% 50%, ${stops})`;

    // Listed top down, which is the order CSS paints them: the label covers the
    // grooves rather than the grooves being carefully drawn around it
    // Every boundary is carried across a sliver of a percent rather than cut
    // dead. A hard stop on a circle steps down the pixel grid, and the label
    // edge — the longest curve on the disc — showed it worst
    const EDGE = 0.5;

    const disc = [
        // Dead wax inside the music and the lead-in outside it, both smooth
        circle(`transparent 0 ${LABEL}%, ${VINYL} ${LABEL + EDGE}% ${MUSIC_INNER}%, transparent ${MUSIC_INNER + EDGE}% ${MUSIC_OUTER}%, ${VINYL} ${MUSIC_OUTER + EDGE}%`),

        ...separations.map(at => circle(
            `transparent 0 ${at - 0.7}%, rgba(0,0,0,0.62) ${at - 0.7}% ${at + 0.7}%, transparent ${at + 0.7}%`,
        )),
    ].join(", ");

    return (
        <Box
            pos="absolute"
            top="50%"
            left={`${offset}px`}
            width={`${size}px`}
            height={`${size}px`}
            /*
              * Put away and taken back out, rather than cross-faded.
              *
              * The disc sits behind the sleeve, so sliding it left by its own
              * offset tucks it fully out of sight and the next one comes back
              * from the same place. Changing the record is the physical thing
              * that happens when a track changes, and it costs one transform.
              */
            transform={changing ? `translate(-${offset}px, -50%)` : "translate(0, -50%)"}
            transition={changing
                ? "transform .28s cubic-bezier(.4, 0, 1, 1)"
                : "transform .34s cubic-bezier(0, 0, .2, 1)"}
            borderRadius="full"
            overflow="hidden"
            zIndex={0}
            aria-hidden
        >
            {/*
              * Turned frame by frame rather than by a CSS animation, so that
              * pausing the track spins the record down from wherever it is and
              * playing again picks it back up — a disc that stops dead, or that
              * carries on under a paused track, is the sort of detail that makes
              * an interface feel like it is not paying attention.
              */}
            <Box
                ref={platter}
                position="absolute"
                inset="0"
                borderRadius="full"
                // The wax itself. Everything else is stacked over it as its own
                // layer, so the grooves can be lit without lighting the disc
                sx={{ background: circle("#101016 0 55%, #050507 100%") }}
            >
                {/*
                  * The grooves, and the shimmer, as one thing.
                  *
                  * The glint used to be its own layer laid across the whole disc,
                  * which is a reflection of the disc — and a disc-wide reflection
                  * has no business turning, because the lamp does not move. Here
                  * it is a mask on the ring pattern instead, so what brightens
                  * and dims is the banding itself: the grooves catching the light
                  * and letting it go as they come round, which is the thing that
                  * actually happens. The fixed sheen above stays exactly where it
                  * is, being the lamp.
                  */}
                <Box
                    position="absolute"
                    inset="0"
                    borderRadius="full"
                    pointerEvents="none"
                    sx={{
                        background: circle(grooves),
                        maskImage: GROOVE_GLINT,
                        WebkitMaskImage: GROOVE_GLINT,
                    }}
                />

                <Box
                    position="absolute"
                    inset="0"
                    borderRadius="full"
                    pointerEvents="none"
                    sx={{ background: disc }}
                />

                {/*
                  * The label, and the reason the record can be read as turning.
                  *
                  * Everything else on the disc is concentric and therefore the
                  * same at every angle. A label is printed, so it is not — and on
                  * a real record it is exactly what your eye locks onto to see
                  * one spin. The sleeve covers all but a few millimetres of it,
                  * and that sliver cycling through the artwork's colours is
                  * enough to make the movement obvious.
                  *
                  * Built from the same palette as the page's wash, so the record
                  * and the background it sits on are coloured from one reading of
                  * the same sleeve.
                  */}
                <Box
                    position="absolute"
                    left="50%"
                    top="50%"
                    /*
                     * LABEL is a share of the radius; width is a share of the
                     * width, which is the diameter. The two are the same number
                     * — doubling it made the label twice the size it should be.
                     */
                    width={`${LABEL}%`}
                    height={`${LABEL}%`}
                    borderRadius="full"
                    transform="translate(-50%, -50%)"
                    style={{ background: labelFill }}
                />

                {/*
                  * The texture of the pressing, and the only reason the record
                  * can be seen to turn.
                  *
                  * Everything else on the disc is concentric, and a concentric
                  * pattern is identical at every angle. Two attempts at fixing
                  * that failed for the same reason: a bright sweep read as light
                  * moving rather than vinyl, and a single seam read as one dark
                  * mark orbiting the centre. The eye tracks a lone feature — it
                  * only reads *rotation* when a whole surface of features moves
                  * together.
                  *
                  * So this is noise, not a mark: the fine mottling of the vinyl
                  * itself, thousands of specks turning at once. Subtle enough to
                  * be surface rather than pattern, and the only cue available,
                  * since the label — what you actually read rotation from on a
                  * real record — is behind the sleeve where it belongs.
                  */}
                <Box
                    position="absolute"
                    inset="0"
                    borderRadius="full"
                    pointerEvents="none"
                    style={{
                        backgroundImage: PRESSING_GRAIN,
                        backgroundSize: "90px 90px",
                        /*
                         * Screen, not overlay. Overlay keeps blacks black — it
                         * multiplies wherever the base is dark — so on vinyl this
                         * near to black it was doing arithmetic that could not
                         * produce a visible result no matter what the noise said.
                         * The disc was turning correctly the whole time and there
                         * was simply nothing on it to see.
                         */
                        mixBlendMode: "screen",
                        opacity: 0.22,
                    }}
                />
            </Box>


            {/* Records are moulded with a raised lip, which catches a thin line of light */}
            <Box
                position="absolute"
                inset="0"
                borderRadius="full"
                pointerEvents="none"
                boxShadow="inset 0 0 0 1px rgba(255,255,255,0.07)"
            />
        </Box>
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
    palette,
    progress,
}: Readonly<{
    state: NonNullable<UpdateEvent["data"]["state"]>;
    tint: Rgb | null;
    accent: string;
    palette: string[];
    progress: number;
}>) {
    const titleRef = useRef<HTMLParagraphElement>(null);
    const titleProbe = useRef<HTMLParagraphElement>(null);

    useFitLines(titleRef, titleProbe, state.name ?? "", 2, TITLE_SIZES);

    const elapsed = (state.duration ?? 0) * Math.min(progress, 1);

    return (
        <Box
            borderRadius={TILE_RADIUS}
            // Trimmed from 18: on a 375px phone the panel's own padding is taken
            // off both ends of the one line that has the least room to give
            padding="14px"
            overflow="hidden"
            position="relative"
            background={tint ? panelFill(tint) : SURFACE_HI}
            transition="background .6s"
        >
            <HStack gap="0" alignItems="center" marginBottom="18px">
                <Box
                    position="relative"
                    width="100px"
                    height="100px"
                    flexShrink={0}
                    /*
                     * One shadow, cast by the sleeve and the disc together.
                     *
                     * They used to carry a box-shadow each, and box-shadows add:
                     * everywhere the two silhouettes overlapped the panel took
                     * both, so a darker band appeared below the seam where the
                     * cover ends and the record starts. Fading one of them only
                     * hid it while the record was moving.
                     *
                     * drop-shadow works off the painted alpha of the whole
                     * subtree, so a record sitting in its sleeve casts the shadow
                     * of a record sitting in its sleeve — one silhouette, one
                     * shadow — and it shrinks to just the sleeve on its own as
                     * the disc slides back in behind it.
                     */
                    sx={{ filter: "drop-shadow(0 10px 16px rgba(0, 0, 0, 0.5))" }}
                >
                    {/*
                      * Narrower than the sleeve in front of it. A disc wider than
                      * the artwork shows above and below the sleeve as well as
                      * beside it, which reads as a badly centred circle rather
                      * than as a record sitting inside its cover.
                      */}
                    <Record size={94} offset={45} playing={state.isPlaying !== false} label={accent} palette={palette} songId={state.songId ?? ""} elapsedMs={elapsed} />

                    {/*
                      * Opaque, and clipped to its own corners.
                      *
                      * The sleeve is the only thing hiding the disc, and it was
                      * only as opaque as whatever the artwork happened to be at
                      * the time — so in the moment after a track change, while
                      * the next cover was still loading, the record could be seen
                      * sliding back out through it. A sleeve is card; nothing
                      * behind one is visible through it, loaded or not.
                      */}
                    <Box
                        position="relative"
                        zIndex={1}
                        borderRadius={SLEEVE_RADIUS}
                        overflow="hidden"
                        background={SURFACE_HI}
                    >
                        <SkeletonImage
                            width="100px"
                            height="100px"
                            borderRadius={SLEEVE_RADIUS}
                            src={getSizedImageUrl(state.imageUrl ?? "", 300, 300)}
                        />
                    </Box>
                </Box>

                {/*
                  * Pushed clear of the record's edge rather than set against the
                  * sleeve, or the first letter of every title lands on the grooves.
                  *
                  * Measured, not guessed: the disc sits 45 into a 100 sleeve and
                  * is 94 across, so it ends 39 past the sleeve. This is that plus
                  * a 16px margin — enough that the title reads as being beside
                  * the record rather than resting against it.
                  *
                  * The sleeve and disc came down a tenth, from 112 and 104, to
                  * buy that margin back for the title — the scarcest thing on
                  * this panel on a narrow phone. What the artwork gives up here
                  * goes straight to the words.
                  */}
                <Stack gap="3px" minWidth="0" flex="1" paddingLeft="55px">
                    <HStack gap="4px" minWidth="0" alignItems="flex-start">
                        <Text
                            ref={titleRef}
                            fontSize={`${TITLE_SIZES[0]}px`}
                            fontWeight="bold"
                            color="#ffffff"
                            noOfLines={2}
                            lineHeight="1.15"
                            // Or the title refuses to shrink below its longest
                            // word and pushes the badge off the panel
                            minWidth="0"
                        >
                            {state.name}
                        </Text>

                        {/*
                          * Unclamped, so it can report how tall the title really
                          * wants to be — the clamped one above always reports
                          * exactly two lines, whatever it is holding
                          */}
                        <chakra.p
                            ref={titleProbe}
                            aria-hidden="true"
                            position="absolute"
                            visibility="hidden"
                            pointerEvents="none"
                            left="0"
                            top="0"
                            fontWeight="bold"
                            lineHeight="1.15"
                        >
                            {state.name}
                        </chakra.p>
                        {state.explicit && (
                            /*
                              * A box exactly one line tall, with the mark centred
                              * inside it, rather than the mark nudged down by a
                              * hand-picked margin.
                              *
                              * The row aligns to the start, which lines the mark
                              * up with the top of the text *box* — not with the
                              * middle of the first line, which is where the eye
                              * expects it. Matching the line height means it
                              * stays centred if the title's type ever changes.
                              */
                            <Box
                                color="rgba(255,255,255,0.5)"
                                flexShrink={0}
                                fontSize="19px"
                                height="1.15em"
                                display="flex"
                                alignItems="center"
                            >
                                <MdExplicit />
                            </Box>
                        )}
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
                    {/*
                      * Nudged off centre on purpose.
                      *
                      * A "1" centred by its advance width does not look centred:
                      * the glyph is a tall stem with a small flag, and its ink
                      * sits 0.048em right of the middle of the box it is given —
                      * measured as the centre of mass of the rendered glyph,
                      * against 0.001em for a "0" and 0.031em for the next worst
                      * digit. In a circle, where there is a ring of empty space
                      * to compare it against, that reads as leaning right.
                      */}
                    <Text
                        fontFamily="Inter"
                        fontWeight="800"
                        fontSize="17px"
                        letterSpacing="-0.03em"
                        color="#101013"
                        lineHeight="1"
                        transform="translateX(-0.048em)"
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
            width="38px"
            height="38px"
            borderRadius="full"
            color={colour}
            transition="color .45s, background .15s"
            cursor="pointer"
            _active={{ background: "rgba(255,255,255,0.09)" }}
            onClick={onClick}
            onKeyDown={e => {
                if (e.key !== "Enter" && e.key !== " ")
                    return;

                // Space scrolls the page as well as activating the control
                e.preventDefault();
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

    /** The artwork colour as it arrives, and the copy the page is painted from. */
    const [accent, setAccent] = useState<Rgb | null>(null);
    const [committedAccent, setCommittedAccent] = useState<Rgb | null>(null);

    /*
     * The cover the wash is currently built from.
     *
     * Committed on the same schedule as the colour, and for the same reason: the
     * artwork and the colour it was read from have to change together or the
     * page spends a fifth of a second wearing one record's colour over another
     * record's cover.
     */
    const [committedArtwork, setCommittedArtwork] = useState<string | null>(null);
    const [committedPalette, setCommittedPalette] = useState<string[]>([]);

    // Written where the colour is read, so the commit below can pick it up
    // without the cross-fade having to depend on it
    const latestArtwork = useRef<string | null>(null);
    const latestPalette = useRef<string[]>([]);
    const [accentVisible, setAccentVisible] = useState<boolean>(false);
    /** The same colour, lifted until text set in it is legible. */
    /*
     * Worked out while rendering rather than set from an effect.
     *
     * As state it was always one paint behind the colour it comes from: the page
     * committed the artwork colour, drew a frame with the ink still on the
     * fallback purple, and only then caught up. Everything the accent touches
     * flickered through purple on the way in.
     */

    const [listenershipHistoryAvailable, setListenershipHistoryAvailable] = useState<boolean>(false);
    const [topSongsFilter, setTopSongsFilter] = useState<TopSongsPeriod>("day");
    const [userTopSongs, setUserTopSongs] = useState<TopSong[]>([]);
    const [topSongsLoading, setTopSongsLoading] = useState<boolean>(true);
    const [pageLoaded, setPageLoaded] = useState<boolean>(false);
    const [profileReady, setProfileReady] = useState<boolean>(false);
    const [colourResolved, setColourResolved] = useState<boolean>(false);
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

        // visibilitychange fires on the way out as well as the way back, so
        // without the check every refresh ran twice — once when the reader left
        // the page, which is the one moment nobody is looking at these figures
        const onVisibility = () => {
            if (document.visibilityState === "visible")
                onReturn();
        };

        const timer = setInterval(onReturn, 60e3);

        window.addEventListener("focus", onReturn);
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            clearInterval(timer);
            window.removeEventListener("focus", onReturn);
            document.removeEventListener("visibilitychange", onVisibility);
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

        // Only the week figures. The top songs have an effect of their own keyed
        // on the period, and it runs on mount too — calling the pair here meant
        // every open of a profile asked for the same five songs twice
        user.getRemoteUserPastWeekStats(profileId)
        .then(d => {
            setPastWeekStats(d);
        })
        .catch(e => {
            console.error("Failed to fetch past week stats, error:", e);
        });

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
     * The page waits on two things: the profile, and a first colour.
     *
     * It used to wait only on the profile, and the colour faded in whenever it
     * turned up — which meant every load arrived painted in the fallback purple
     * and then slid across to the record's own colour a moment later. Waiting on
     * the colour outright is what that was avoiding: a profile with nothing
     * playing and no picture to read may never produce one, and the page would
     * sit on a spinner until the failsafe fired.
     *
     * So the colour gate is satisfied by a read *finishing* rather than by it
     * finding something, and by there being nothing to read in the first place.
     * The failsafe still covers the case where neither ever comes back.
     */
    useEffect(() => {
        let cancelled = false;

        // Bumped on every artwork read, so only the newest one may paint
        let colourRequest = 0;

        const settleProfile = () => { if (!cancelled) setProfileReady(true); };
        const settleColour = () => { if (!cancelled) setColourResolved(true); };

        // A profile that will not load is still a page worth showing the rest of
        const failsafe = setTimeout(() => {
            settleProfile();
            settleColour();
        }, 4000);

        user.getRemoteUser(profileId)
        .then(r => {
            if (!cancelled)
                setProfileData(r);
        })
        .catch(e => {
            console.error("Failed to get remote user for", profileId, "error:", e);
        })
        .finally(settleProfile);

        let streamerGotMsg = false;

        /**
         * Reads a colour off an image and paints the page with it, if it is
         * still the image the page is waiting on.
         *
         * Skipping a track twice puts two reads in flight at once, and they do
         * not necessarily come back in the order they went out — without the
         * sequence check a slow read of the track you just skipped can land last
         * and leave the page the colour of a record that is no longer playing.
         */
        const readArtworkColour = (url: string) => {
            /*
             * The same sleeve is not news.
             *
             * This runs on every playback update, not only on a track change —
             * progress ticks included — and it used to re-read the cover each
             * time. Every read produced a new colour object, which was a new
             * value as far as the cross-fade was concerned, so the page faded
             * its colour out and back in every few seconds for the whole of a
             * song. That is the flashing.
             */
            if (url === latestArtwork.current) {
                settleColour();

                return;
            }

            const request = ++colourRequest;

            /*
             * Read together, and taken together or not at all.
             *
             * The accent, the palette and the cover are three descriptions of
             * one record, and they were being stored the moment each arrived.
             * Skip two tracks quickly and they came from three different ones:
             * the cover of what is playing now, the colour of what was playing a
             * second ago, and whichever palette happened to resolve last. This
             * way a track that has already been skipped past cannot write
             * anything at all.
             */
            Promise.all([extractArtworkColour(url), extractArtworkPalette(url)])
            .then(([colour, colours]) => {
                // Released before the sequence check, not after it: a read that
                // has been overtaken has still answered the question of whether
                // the page may be shown
                settleColour();

                if (cancelled || request !== colourRequest)
                    return;

                latestArtwork.current = url;
                latestPalette.current = colours;

                // Compared by value: two sleeves can share a colour, and
                // re-committing one the page is already wearing restarts the
                // cross-fade for no visible reason
                setAccent(current => (sameRgb(current, colour) ? current : colour));
            })
            .catch(e => {
                settleColour();

                console.error("Failed to read a colour off the artwork, error:", e);
            });
        };

        // Until something is playing, the page takes its colour from the profile
        // picture — an idle profile with no colour at all is the same near black
        // rectangle for everybody
        const picture = user?.object?.images?.[0]?.url;

        /**
         * The colour to fall back to when nothing is playing.
         *
         * `waitForPlayback` is only true on the first pass, where a record that
         * is already on should win the race. When this is called because
         * playback stopped there is nothing to defer to.
         */
        const readPictureColour = (waitForPlayback: boolean) => {
            if (!picture || picture === latestArtwork.current) {
                settleColour();

                return;
            }

            const request = ++colourRequest;

            Promise.all([extractArtworkColour(picture), extractArtworkPalette(picture)])
            .then(([colour, colours]) => {
                settleColour();

                // Playback wins: once a record is on, its colour is the page's
                if (cancelled || (waitForPlayback && streamerGotMsg) || request !== colourRequest)
                    return;

                latestArtwork.current = picture;
                latestPalette.current = colours;

                setAccent(current => (sameRgb(current, colour) ? current : colour));
            })
            .catch(e => {
                settleColour();

                console.error("Failed to read a colour off the profile picture, error:", e);
            });
        };

        /*
         * Stopping is not the same as having stopped.
         *
         * A gap between tracks, a skip, or a moment of buffering all arrive as a
         * stop, and dropping the page's colour the instant one lands means the
         * whole page blinks back to grey and then recolours a second later. The
         * colour is held for a beat, and if nothing has started by then the page
         * settles onto the profile picture rather than onto nothing.
         */
        let stopping: ReturnType<typeof setTimeout> | undefined;

        const clearStopping = () => {
            if (stopping === undefined)
                return;

            clearTimeout(stopping);
            stopping = undefined;
        };

        const playbackStopped = () => {
            setPlaybackState(null);
            clearStopping();

            stopping = setTimeout(() => {
                stopping = undefined;

                readPictureColour(false);
            }, 1500);
        };

        if (picture) {
            readPictureColour(true);
        } else {
            // No picture and nothing playing yet. There is no colour coming that
            // is worth holding the page for
            settleColour();
        }

        if (!streamer)
            return () => {
                cancelled = true;
                clearTimeout(failsafe);
                clearStopping();
            };

        streamer.detachedListeningStateQuery([profileId]);

        const onUpdate = (data: UpdateEvent) => {
            if (data.userId !== profileId)
                return;

            if (data.data.action.type == "STOPPED") {
                playbackStopped();

                return;
            }

            // Outside the state updater. React is free to call an updater more
            // than once for one update, and does exactly that under StrictMode —
            // with this work inside it, a single track change fired two reads of
            // the artwork and two writes of the page colour
            setPlaybackState(data);

            if (!data.data.state)
                return;

            streamerGotMsg = true;

            // Whatever this is, it is not stopped
            clearStopping();

            readArtworkColour(data.data.state.imageUrl);
        };

        const onRemove = (userId: string) => {
            if (userId !== profileId)
                return;

            playbackStopped();
        };

        streamer.on("update", onUpdate);
        streamer.on("remove", onRemove);

        return () => {
            cancelled = true;
            clearTimeout(failsafe);

            // The hold before a stop takes effect can outlive the page that
            // armed it: leaving a profile within a second and a half of the
            // music stopping left a timer to wake up and read a colour off a
            // picture belonging to a profile nobody is looking at any more
            clearStopping();

            // Without this the listeners outlive the component, so every visit to
            // a profile stacks another pair and each event fires N setStates
            streamer.off?.("update", onUpdate);
            streamer.off?.("remove", onRemove);
        };
        // `streamer` belongs here. The frame creates it as null and sets it in an
        // effect, and a child's effects run before its parent's — so on the
        // render where signing in completes this ran with no streamer, and with
        // it missing from the list it never ran again. The page then never showed
        // a note of what was playing, for as long as it stayed open.
    }, [user.isLoggedIn, profileId, streamer]);

    /**
     * Cross-fades the page's colour rather than cutting to it.
     *
     * The new colour is held back until the old one has faded out, so a track
     * change moves through the page background instead of snapping it.
     */
    useEffect(() => {
        if (!accent) {
            setCommittedAccent(null);
            setCommittedArtwork(null);
            setCommittedPalette([]);

            const timer = setTimeout(() => setAccentVisible(true), 20);

            return () => clearTimeout(timer);
        }

        /*
         * Straight on if the page has no colour yet.
         *
         * The wait below is the old colour fading out, and on the first read
         * there is no old colour — so this used to hold the page on the fallback
         * purple for 230ms before painting it, which is most of what the flash
         * on load actually was.
         */
        if (!committedAccent) {
            setCommittedAccent(accent);
            setCommittedArtwork(latestArtwork.current);
            setCommittedPalette(latestPalette.current);

            const first = setTimeout(() => setAccentVisible(true), 20);

            return () => clearTimeout(first);
        }

        setAccentVisible(false);

        // Just past the fade, so the swap happens against an invisible layer
        const commit = setTimeout(() => {
            setCommittedAccent(accent);
            setCommittedArtwork(latestArtwork.current);
            setCommittedPalette(latestPalette.current);
        }, ACCENT_FADE_OUT + 10);
        const show = setTimeout(() => setAccentVisible(true), ACCENT_FADE_OUT + 30);

        return () => {
            clearTimeout(commit);
            clearTimeout(show);
        };
    }, [accent, committedAccent]);

    useEffect(() => {
        hideTopGradientCb(accent !== null);
    }, [accent]);

    /**
     * When the page is allowed to appear.
     *
     * Gated on the colour being *committed*, not on it having been read — the
     * two are a couple of frames and a cross-fade apart, and revealing on the
     * read is what put the fallback purple on screen before the artwork colour
     * replaced it.
     *
     * A read that came back with nothing has nothing to wait for, so an idle
     * profile with no picture still opens straight away rather than sitting on
     * the spinner until the failsafe fires.
     */
    useEffect(() => {
        if (!profileReady || !colourResolved)
            return;

        if (accent !== null && !committedAccent)
            return;

        setPageLoaded(true);
    }, [profileReady, colourResolved, accent, committedAccent]);

    /**
     * The status bar, and the colour the app frame draws its title in.
     *
     * The status bar takes the artwork colour mixed halfway into the page, so the
     * bar reads as the top of the page rather than as a band of album cover above
     * it. The title takes the lifted, legible version.
     */
    const accentInk = useMemo(
        () => (committedAccent ? readableAccent(committedAccent) : FALLBACK_ACCENT),
        [committedAccent],
    );

    useEffect(() => {
        if (!committedAccent) {
            setStatusBarColour(PAGE_BG);
            setComplementaryColour("#e9e7fb");

            return;
        }

        setStatusBarColour(rgbToHex({
            r: 0.5 * committedAccent.r + 0.5 * 13,
            g: 0.5 * committedAccent.g + 0.5 * 13,
            b: 0.5 * committedAccent.b + 0.5 * 14,
        }));

        setComplementaryColour(accentInk);
    }, [committedAccent, accentInk]);

    /*
     * Reconnecting a dead socket is the app frame's job, not this page's.
     *
     * There was a copy of it here, and it could not work: the focus handler set
     * the playback state to null and then armed the reset, while the effect that
     * performed the reset would only run if the playback state was truthy. The
     * one thing that could have cleared the flag was the thing the handler had
     * just cleared, so the reset sat armed and the socket stayed dead.
     *
     * It was also wrong in two ways the frame's version documents: it tore down
     * a socket that was still negotiating, because it checked isReady() without
     * isConnecting(), and it called cleanup() before init() when init() already
     * runs its own cleanup, so every reconnect tore the socket down twice.
     */

    const tint = (accentVisible ? committedAccent : null);
    const nowPlaying = playbackState?.data.state ?? null;
    const hasListened = (pastWeekStats?.totalListeningDuration ?? 0) > 0 || (pastWeekStats?.uniqueSongsPlayedCount ?? 0) > 0;

    // Unconditional: the tile it belongs to is not always drawn, but a hook
    // cannot come and go with it
    const washFade = useRef<HTMLDivElement>(null);

    // Gone by the time the header it belongs to is
    useScrollFade(washFade, 300);

    const listeningFact = useListeningFact(pastWeekStats?.totalListeningDuration ?? 0);

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
        ? `${formatListening(sessionMs)} streak`
        : "Now spinning");

    return (<>

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
            background={committedAccent && !committedArtwork
                ? `linear-gradient(to bottom, rgb(${committedAccent.r},${committedAccent.g},${committedAccent.b}) 0%, rgba(0,0,0,0) 100%)`
                : "transparent"}
            opacity={accentVisible && committedAccent ? (committedArtwork ? 0.5 : 0.2) : 0}
            transform={accentVisible ? "translateY(0)" : "translateY(-24px)"}
            width="100vw"
            // Taller than the flat gradient it replaces. A wash built out of a
            // cover needs room for the shapes in it to be shapes; squeezed into
            // a header band the blur averages the whole thing to one colour and
            // there was no point building it out of the artwork at all
            height="420px"
            transition={`opacity ${accentVisible ? ACCENT_FADE_IN : ACCENT_FADE_OUT}ms, transform ${accentVisible ? ACCENT_FADE_IN : ACCENT_FADE_OUT}ms`}
        >
            {/*
              * The scroll fade sits on its own layer, because the box above is
              * already using opacity for the colour cross-fade and the two have
              * nothing to do with each other
              */}
            <Box ref={washFade} position="absolute" inset="0">
                {committedArtwork && <ArtworkWash src={committedArtwork} palette={committedPalette} still={!nowPlaying} />}
            </Box>
        </Box>

        <Stack
            gap="30px"
            width="calc(100% - 20px)"
            paddingLeft="20px"
            // Clears the fixed page header only. The inset itself comes from
            // the padding on body, and adding it again here counted it twice
            paddingTop="44px"
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
                // None: the row already sits inside the page gutter, and the
                // action's own box gives the cog the space it needs. Anything
                // here is added on top of both and pushes it off the margin the
                // rest of the page is set to
                paddingRight="0"
                animation={`${rise} .3s ease-out both`}
            >
                <Box
                    width="56px"
                    height="56px"
                    minWidth="56px"
                    borderRadius="18px"
                    flexShrink={0}
                    boxShadow={nowPlaying ? `0 0 0 2.5px ${PAGE_BG}, 0 0 0 5px ${accentInk}` : "none"}
                    transition="box-shadow .45s"
                >
                    {((profileData?.images.length ?? 0) > 0 && !pfpLoadFailed) ? (
                        <SkeletonImage
                            width="56px"
                            height="56px"
                            borderRadius="18px"
                            src={getSizedImageUrl(findBestSCDNImageSize(profileData?.images ?? [], 120, 120) ?? "", 120, 120)}
                            colourBlob={profileData?.profilePictureColourBlob}
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
                    {/*
                      * Gated on the profile having loaded, not on it having a
                      * name. A blank display name is falsy, so the previous
                      * check left an account without one waiting on a skeleton
                      * that nothing was ever going to replace.
                      */}
                    {profileData ? (
                        <Text
                            fontFamily="Inter"
                            fontWeight="bold"
                            fontSize="24px"
                            letterSpacing="-0.02em"
                            lineHeight="1.15"
                            color={INK}
                            noOfLines={1}
                        >
                            {shortName(profileData.displayName)}
                        </Text>
                    ) : (
                        <Skeleton height="22px" width="45%" borderRadius="4px" />
                    )}

                    {/*
                      * The classification, stuck on at an angle.
                      *
                      * It is the one thing Tempo works out about somebody rather
                      * than counts, and as a second line of grey text it read as
                      * a caption nobody had bothered to write.
                      */}
                    <Box alignSelf="flex-start" transform="rotate(-2.2deg)">
                        <Box
                            paddingX="10px"
                            paddingY="4px"
                            borderRadius="full"
                            background={tint ? chipFill(tint) : SURFACE_HI}
                            transition="background .45s"
                        >
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
                {/*
                  * In the header rather than pinned over the page.
                  *
                  * Fixed to the viewport these spent most of a session floating
                  * over the song list, where they needed a scrim behind them to
                  * stay readable — a control that has to defend itself from the
                  * content behind it is in the wrong place. They belong to the
                  * header, so they leave with it.
                  */}
                {isOwnProfile && (
                    <HStack alignSelf="flex-start" alignItems="center" gap="8px" flexShrink={0}>
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
            </HStack>

            {nowPlaying && (
                <Box animation={`${rise} .3s ease-out both`} style={{ animationDelay: "50ms" }}>
                    <Rubric colour={accentInk}>{nowHeading}</Rubric>
                    <NowSpinning
                        state={nowPlaying}
                        tint={tint}
                        accent={accentInk}
                        palette={committedPalette}
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
                    <Grid templateColumns="minmax(0, 1.32fr) minmax(0, 1fr)" templateRows="auto auto" gap="9px">
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
                                    floor={60e3}
                                    size={{ base: "52px", sm: "60px" }}
                                    colour={accentInk}
                                />
                                <Text fontSize="13px" color={INK_DIM} lineHeight="1.35">
                                    spent listening
                                </Text>

                                {/*
                                  * Sat on the floor of the tile rather than under
                                  * the label. The figure is anchored to the top
                                  * corner and the tile is taller than it needs to
                                  * be, so the space between them is the tile's
                                  * shape — filling it from the bottom keeps that
                                  * shape instead of stacking everything at once.
                                  */}
                                {listeningFact && (
                                    <Box
                                        marginTop="auto"
                                        paddingTop="10px"
                                        width="100%"
                                        fontSize="12px"
                                        /*
                                         * Four lines, reserved whether they are
                                         * used or not. The longest fact runs to
                                         * four and the shortest to two, and
                                         * without a floor the tile — and the
                                         * whole bento row with it — changed
                                         * height depending on which one came up.
                                         */
                                        minHeight="5.6em"
                                        display="flex"
                                        // Sat on the floor of the reserved block,
                                        // so a two line fact and a four line one
                                        // both end on the same baseline
                                        alignItems="flex-end"
                                    >
                                        <Text
                                            fontSize="12px"
                                            color={INK_FAINT}
                                            lineHeight="1.4"
                                            // Cut rather than quietly taking the
                                            // layout back, if a longer one is
                                            // added later
                                            noOfLines={4}
                                        >
                                            About as long as {listeningFact.label}.
                                        </Text>
                                    </Box>
                                )}

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
                                    floor={60e3}
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
                                            if (e.key !== "Enter" && e.key !== " ")
                                                return;

                                            e.preventDefault();
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
