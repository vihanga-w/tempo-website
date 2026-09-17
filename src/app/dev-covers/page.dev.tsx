"use client";

/**
 * A platter of playlist covers, each made from the playlist itself.
 *
 * Every cover here is an SVG built from what a playlist already carries: its
 * name and recipe, the artwork of its songs and the colours in it, the
 * friends behind it, the listener's name and the week it was made. Nothing is
 * drawn by hand, so any of these can be made on the server the same way — the
 * server has sharp, which rasterises SVG to the JPEG Spotify takes.
 *
 *   /dev-covers   three playlists, six styles each
 */

import "@fontsource/inter/500.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import { Box, ChakraProvider, DarkMode, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";

import { theme } from "../theme";
import { extractArtworkPalette } from "@/lib/artwork-colour";
import { avatarColour } from "@/lib/avatar-colour";

const ART = {
    blonde: "/art/art-blonde.jpg",
    inrainbows: "/art/art-inrainbows.jpg",
    ram: "/art/art-ram.jpg",
    tpab: "/art/art-tpab.jpg",
    nevermind: "/art/art-nevermind.jpg",
    afterhours: "/art/art-afterhours.jpg",
    depcherry: "/art/art-depcherry.jpg",
};

type Song = { id: string; title: string; art: string; friend?: { id: string; name: string; picture?: string } };
type Sample = { name: string; recipe: string; blurb: string; listener: string; madeOn: string; songs: Song[] };

const SAMPLES: Sample[] = [
    {
        name: "Your mix", recipe: "Your mix", blurb: "Likes, your plays and your friends', weighed together.", listener: "Vihanga", madeOn: "17 Sep 2026",
        songs: [
            { id: "nights", title: "Nights", art: ART.blonde },
            { id: "weird", title: "Weird Fishes", art: ART.inrainbows, friend: { id: "u-maya", name: "Maya" } },
            { id: "alright", title: "Alright", art: ART.tpab },
            { id: "crush", title: "Instant Crush", art: ART.ram },
            { id: "tears", title: "Save Your Tears", art: ART.afterhours, friend: { id: "u-jon", name: "Jon" } },
            { id: "cherry", title: "Cherry-coloured Funk", art: ART.depcherry },
            { id: "lithium", title: "Lithium", art: ART.nevermind, friend: { id: "u-sam", name: "Sam" } },
        ],
    },
    {
        name: "On repeat with friends", recipe: "On repeat with friends", blurb: "What your friends kept playing this week.", listener: "Vihanga", madeOn: "17 Sep 2026",
        songs: [
            { id: "weird", title: "Weird Fishes", art: ART.inrainbows, friend: { id: "u-maya", name: "Maya", picture: ART.blonde } },
            { id: "tears", title: "Save Your Tears", art: ART.afterhours, friend: { id: "u-jon", name: "Jon" } },
            { id: "lithium", title: "Lithium", art: ART.nevermind, friend: { id: "u-sam", name: "Sam", picture: ART.tpab } },
            { id: "alright", title: "Alright", art: ART.tpab, friend: { id: "u-priya", name: "Priya", picture: ART.depcherry } },
        ],
    },
    {
        name: "Liked in Discover", recipe: "Liked in Discover", blurb: "Everything you swiped right on, newest first.", listener: "Vihanga", madeOn: "17 Sep 2026",
        songs: [
            { id: "cherry", title: "Cherry-coloured Funk", art: ART.depcherry },
            { id: "nights", title: "Nights", art: ART.blonde },
            { id: "crush", title: "Instant Crush", art: ART.ram },
            { id: "afterhours", title: "After Hours", art: ART.afterhours },
            { id: "weird", title: "Weird Fishes", art: ART.inrainbows },
        ],
    },
];

const BLACK = "#0D0D0E";
const S = 640;

/** A stable number in [0, 1) from a string, so a playlist always draws the same way. */
function hash01(key: string, salt = 0): number {
    let h = 2166136261 ^ salt;

    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }

    return ((h >>> 0) % 10000) / 10000;
}

/** The Tempo mark: a square with a bite, and a disc in the bite. */
function Mark({ x, y, size, fill = "url(#markGrad)" }: { x: number; y: number; size: number; fill?: string }) {
    const s = size;

    return (
        <g transform={`translate(${x} ${y})`}>
            <path d={`M0 0 H${s} V${s * 0.36} H${s * 0.36} V${s} H0 Z`} fill={fill} />
            <circle cx={s * 0.68} cy={s * 0.68} r={s * 0.3} fill="url(#markDisc)" />
        </g>
    );
}

function Defs({ palette }: { palette: string[] }) {
    const [a = "#A480FF", b = "#FF5F8F", c = "#4FE3C1"] = palette;

    return (
        <defs>
            <linearGradient id="markGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#B36BFF" />
                <stop offset="0.5" stopColor="#FF3C7E" />
                <stop offset="1" stopColor="#FF8A4B" />
            </linearGradient>
            <radialGradient id="markDisc" cx="0.35" cy="0.3" r="0.9">
                <stop offset="0" stopColor="#FFFFFF" />
                <stop offset="0.55" stopColor="#FFD3EC" />
                <stop offset="1" stopColor="#7CF4D8" />
            </radialGradient>
            <radialGradient id="washA" cx="0.2" cy="0.15" r="0.8"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={a} stopOpacity="0" /></radialGradient>
            <radialGradient id="washB" cx="0.85" cy="0.35" r="0.7"><stop offset="0" stopColor={b} /><stop offset="1" stopColor={b} stopOpacity="0" /></radialGradient>
            <radialGradient id="washC" cx="0.5" cy="0.95" r="0.7"><stop offset="0" stopColor={c} /><stop offset="1" stopColor={c} stopOpacity="0" /></radialGradient>
            <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stopColor={BLACK} stopOpacity="0" /><stop offset="1" stopColor={BLACK} stopOpacity="0.92" /></linearGradient>
            <clipPath id="square"><rect width={S} height={S} rx="0" /></clipPath>
        </defs>
    );
}

const Frame = ({ children, palette }: { children: React.ReactNode; palette: string[] }) => (
    <svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ display: "block", borderRadius: 10, background: BLACK }}>
        <Defs palette={palette} />
        {children}
    </svg>
);

/** 1. Mosaic: the first four covers, the mark on a plate, the name in a band. */
function Mosaic({ p, palette }: { p: Sample; palette: string[] }) {
    const four = p.songs.slice(0, 4);

    return (
        <Frame palette={palette}>
            {four.map((s, i) => (
                <image key={s.id} href={s.art} x={(i % 2) * (S / 2)} y={Math.floor(i / 2) * (S / 2)} width={S / 2} height={S / 2} preserveAspectRatio="xMidYMid slice" />
            ))}
            <rect width={S} height={S} fill="url(#fade)" />
            <rect x="24" y="24" width="84" height="84" rx="18" fill={BLACK} opacity="0.92" />
            <Mark x={40} y={40} size={52} />
            <text x="32" y={S - 60} fill="#fff" fontFamily="Inter" fontWeight="800" fontSize="44" letterSpacing="-1.5">{p.name}</text>
            <text x="32" y={S - 28} fill="#fff" opacity="0.7" fontFamily="Inter" fontWeight="500" fontSize="18">Made in Tempo · {p.madeOn}</text>
        </Frame>
    );
}

/** 2. Wash: the songs' own colours as a wash, and the name set large. */
function Wash({ p, palette }: { p: Sample; palette: string[] }) {
    const words = p.name.split(" ");

    return (
        <Frame palette={palette}>
            <rect width={S} height={S} fill={BLACK} />
            <rect width={S} height={S} fill="url(#washA)" opacity="0.85" />
            <rect width={S} height={S} fill="url(#washB)" opacity="0.75" />
            <rect width={S} height={S} fill="url(#washC)" opacity="0.6" />
            <rect width={S} height={S} fill="url(#fade)" opacity="0.6" />
            <Mark x={S - 116} y={40} size={72} fill="#fff" />
            {words.map((w, i) => (
                <text key={i} x="40" y={S - 150 + (i - words.length + 1) * 78} fill="#fff" fontFamily="Inter" fontWeight="800" fontSize="76" letterSpacing="-3">{w}</text>
            ))}
            <text x="40" y={S - 88} fill="#fff" opacity="0.8" fontFamily="Inter" fontWeight="500" fontSize="20">for {p.listener}</text>
            <text x="40" y={S - 52} fill="#fff" opacity="0.5" fontFamily="Inter" fontWeight="500" fontSize="18">{p.recipe} · {p.madeOn}</text>
        </Frame>
    );
}

/** 3. Stamp: a Passport-style ring, the mark inside, the recipe around it. */
function Stamp({ p, palette }: { p: Sample; palette: string[] }) {
    const [ink = "#A480FF"] = palette;
    const tilt = -8 + hash01(p.name) * 16;

    return (
        <Frame palette={palette}>
            <rect width={S} height={S} fill={BLACK} />
            <rect width={S} height={S} fill="url(#washB)" opacity="0.25" />
            <g transform={`rotate(${tilt} ${S / 2} ${S / 2})`}>
                <circle cx={S / 2} cy={S / 2} r="228" fill="none" stroke={ink} strokeWidth="10" opacity="0.9" />
                <circle cx={S / 2} cy={S / 2} r="200" fill="none" stroke={ink} strokeWidth="3" opacity="0.6" />
                <path id="ring" d={`M ${S / 2 - 214} ${S / 2} a 214 214 0 1 1 428 0 a 214 214 0 1 1 -428 0`} fill="none" />
                <text fill={ink} fontFamily="Inter" fontWeight="800" fontSize="30" letterSpacing="6">
                    <textPath href="#ring" startOffset="2%">{p.recipe.toUpperCase()} · MADE IN TEMPO · {p.madeOn.toUpperCase()} ·</textPath>
                </text>
                <Mark x={S / 2 - 70} y={S / 2 - 90} size={140} fill={ink} />
                <text x={S / 2} y={S / 2 + 118} textAnchor="middle" fill="#fff" fontFamily="Inter" fontWeight="700" fontSize="24" letterSpacing="4">{p.listener.toUpperCase()}</text>
            </g>
        </Frame>
    );
}

/** 5. Pulse: one bar per song, its height from the song, coloured from the covers. */
function Pulse({ p, palette }: { p: Sample; palette: string[] }) {
    const bars = p.songs.length;
    const gap = 10;
    const w = (S - 80 - gap * (bars - 1)) / bars;

    return (
        <Frame palette={palette}>
            <rect width={S} height={S} fill={BLACK} />
            {p.songs.map((s, i) => {
                const h = 120 + hash01(s.id, 7) * 260;
                const colour = palette[i % Math.max(palette.length, 1)] ?? "#A480FF";

                return <rect key={s.id} x={40 + i * (w + gap)} y={S - 150 - h} width={w} height={h} rx={w / 2} fill={colour} opacity="0.95" />;
            })}
            <Mark x={40} y={40} size={64} fill="#fff" />
            <text x={S - 40} y="84" textAnchor="end" fill="#fff" opacity="0.6" fontFamily="Inter" fontWeight="500" fontSize="18">{p.songs.length} songs · {p.madeOn}</text>
            <text x="40" y={S - 78} fill="#fff" fontFamily="Inter" fontWeight="800" fontSize="52" letterSpacing="-2">{p.name}</text>
            <text x="40" y={S - 40} fill="#fff" opacity="0.6" fontFamily="Inter" fontWeight="500" fontSize="19">{p.blurb}</text>
        </Frame>
    );
}

/** 6. Fan: three covers fanned like a hand of cards, the mark in the corner, and the friends behind it as chips. As the server now draws every cover. */
function Fan({ p, palette }: { p: Sample; palette: string[] }) {
    const cards = p.songs.slice(0, 3);
    const friends = p.recipe === "On repeat with friends"
        ? Array.from(new Map(p.songs.filter(s => s.friend).map(s => [s.friend!.id, s.friend!])).values())
        : [];
    const chips = friends.length > 0;
    const size = chips ? 280 : 300;
    const cy = chips ? S / 2 - 84 : S / 2 - 48;
    const spread = cards.length === 1 ? 0 : cards.length === 2 ? 30 : 46;
    const tilt = cards.length === 1 ? 0 : cards.length === 2 ? 9 : 14;
    const markSize = 88;
    // Sample songs carry no length; call them three and three-quarter minutes each
    const minutes = Math.round(p.songs.length * 3.75);
    const runs = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;

    return (
        <Frame palette={palette}>
            <rect width={S} height={S} fill={BLACK} />
            <rect width={S} height={S} fill="url(#washA)" opacity="0.3" />
            <rect width={S} height={S} fill="url(#washB)" opacity="0.25" />
            <rect width={S} height={S} fill="url(#washC)" opacity="0.3" />
            <rect width={S} height={S} fill="url(#fade)" />
            {[...cards.entries()].reverse().map(([i, s]) => {
                const offset = i - (cards.length - 1) / 2;

                return (
                    <g key={s.id} transform={`translate(${S / 2 + offset * spread} ${cy}) rotate(${offset * tilt}) translate(${-size / 2} ${-size / 2})`}>
                        <rect x="-6" y="-6" width={size + 12} height={size + 12} rx="18" fill={BLACK} opacity="0.7" />
                        <clipPath id={`card-${p.name}-${i}`}><rect width={size} height={size} rx="14" /></clipPath>
                        <image href={s.art} width={size} height={size} preserveAspectRatio="xMidYMid slice" clipPath={`url(#card-${p.name}-${i})`} />
                    </g>
                );
            })}
            <text x="32" y={chips ? S - 122 : S - 66} fill="#fff" fontFamily="Inter" fontWeight="800" fontSize="40" letterSpacing="-1.2">{p.name}</text>
            <text x="32" y={chips ? S - 92 : S - 34} fill="#fff" opacity="0.62" fontFamily="Inter" fontWeight="500" fontSize="19">for {p.listener} · {runs}</text>
            {friends.map((f, i) => {
                const colour = avatarColour(f.id);
                const cx = 32 + 21 + i * 48;

                return (
                    <g key={f.id}>
                        {f.picture ? (
                            <>
                                <clipPath id={`chip-${p.name}-${i}`}><circle cx={cx} cy={S - 48} r="21" /></clipPath>
                                <image href={f.picture} x={cx - 21} y={S - 69} width="42" height="42" preserveAspectRatio="xMidYMid slice" clipPath={`url(#chip-${p.name}-${i})`} />
                                <circle cx={cx} cy={S - 48} r="21" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.5" />
                            </>
                        ) : (
                            <>
                                <circle cx={cx} cy={S - 48} r="21" fill={colour.from} />
                                <text x={cx} y={S - 41} textAnchor="middle" fill={colour.ink} fontFamily="Inter" fontWeight="800" fontSize="20">{f.name[0]}</text>
                            </>
                        )}
                    </g>
                );
            })}
            <image href="/icon.png" x={S - markSize - 28} y={S - markSize - 28} width={markSize} height={markSize} clipPath="inset(0 round 20px)" />
        </Frame>
    );
}

const STYLES: { name: string; note: string; render: (p: Sample, palette: string[]) => React.ReactNode }[] = [
    { name: "Mosaic", note: "Spotify's own idea, made ours: four covers, the mark on a plate, the name in a band.", render: (p, c) => <Mosaic p={p} palette={c} /> },
    { name: "Wash", note: "The songs' colours as a wash behind the name. Every playlist gets its own weather.", render: (p, c) => <Wash p={p} palette={c} /> },
    { name: "Stamp", note: "Passport's stamp, tilted by the name's hash, the recipe around the ring.", render: (p, c) => <Stamp p={p} palette={c} /> },
    { name: "Pulse", note: "One bar per song, height from the song, colour from the covers: a fingerprint of the list.", render: (p, c) => <Pulse p={p} palette={c} /> },
    { name: "Fan", note: "Three covers as a hand of cards, the mark in the corner, and for the friends recipe the people behind it as chips, their own pictures where they have one. What the server now draws for every playlist.", render: (p, c) => <Fan p={p} palette={c} /> },
];

function Platter() {
    const [palettes, setPalettes] = useState<Record<string, string[]>>({});

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const out: Record<string, string[]> = {};

            for (const p of SAMPLES) {
                const colours: string[] = [];

                for (const s of p.songs.slice(0, 3)) {
                    try {
                        const found = await extractArtworkPalette(s.art, 2);

                        colours.push(...found);
                    } catch { }
                }

                out[p.name] = colours;
            }

            if (!cancelled)
                setPalettes(out);
        })();

        return () => { cancelled = true; };
    }, []);

    const ready = useMemo(() => Object.keys(palettes).length === SAMPLES.length, [palettes]);

    return (
        // Its own scrolling surface: the app's shell locks the body
        <Box position="fixed" inset="0" overflowY="auto" background={BLACK} padding="28px" paddingBottom="80px" color="#f6f5f8" fontFamily="Inter" sx={{ WebkitOverflowScrolling: "touch" }}>
            <Text fontWeight="800" fontSize="28px" letterSpacing="-0.02em">Playlist covers, made from the playlist</Text>
            <Text color="#9d9aa6" fontSize="15px" marginTop="6px" maxWidth="70ch">
                Six styles, three playlists each. Everything in a cover comes from the playlist: its name and recipe, its songs&apos; artwork and the colours in it, the friends behind it, who it is for and when it was made. {ready ? "Colours are read from the covers." : "Reading colours from the covers…"}
            </Text>

            <Stack gap="40px" marginTop="28px">
                {STYLES.map(style => (
                    <Box key={style.name}>
                        <Text fontWeight="800" fontSize="20px">{style.name}</Text>
                        <Text color="#9d9aa6" fontSize="14px" marginBottom="14px" maxWidth="70ch">{style.note}</Text>
                        <SimpleGrid minChildWidth="240px" spacing="14px" maxWidth="1100px">
                            {SAMPLES.map(p => (
                                <Box key={p.name}>{style.render(p, palettes[p.name] ?? [])}</Box>
                            ))}
                        </SimpleGrid>
                    </Box>
                ))}
            </Stack>
        </Box>
    );
}

export default function Page() {
    return (
        <ChakraProvider theme={theme}>
            <DarkMode>
                <Platter />
            </DarkMode>
        </ChakraProvider>
    );
}
