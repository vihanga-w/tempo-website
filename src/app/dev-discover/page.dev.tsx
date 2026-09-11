"use client";

/**
 * A bench for Discover, with a feed made up here rather than asked for.
 *
 * ?state=empty   a feed with nothing in it
 * ?state=slow    every page takes a second and a half, to see the loading card
 * ?calm=1        the cheap path a device in Low Power Mode gets
 *
 * Covers are the ones in /public/art. Previews are a tone generated on the
 * spot, so the player can be seen playing without a server.
 */

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import { ChakraProvider, DarkMode } from "@chakra-ui/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { theme } from "../theme";
import BenchChrome from "@/components/bench-chrome.dev";
import DiscoverPage from "@/components/discover-page";
import type User from "@/lib/usrlib";
import type { FeedItem } from "@/lib/usrlib";

const ART = {
    blonde: "/art/art-blonde.jpg",
    inrainbows: "/art/art-inrainbows.jpg",
    ram: "/art/art-ram.jpg",
    tpab: "/art/art-tpab.jpg",
    nevermind: "/art/art-nevermind.jpg",
    afterhours: "/art/art-afterhours.jpg",
    depcherry: "/art/art-depcherry.jpg",
};

/** Thirty seconds of a quiet chord as a WAV, so the preview has something to play. */
function tone(): string {
    const rate = 8000;
    const seconds = 30;
    const samples = rate * seconds;
    const buffer = new ArrayBuffer(44 + samples);
    const view = new DataView(buffer);
    const write = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));

    write(0, "RIFF"); view.setUint32(4, 36 + samples, true); write(8, "WAVE");
    write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
    write(36, "data"); view.setUint32(40, samples, true);

    for (let i = 0; i < samples; i++) {
        const t = i / rate;
        const v = 0.12 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.2 * t) + Math.sin(2 * Math.PI * 329.6 * t)) / 3;

        view.setUint8(44 + i, Math.round(128 + v * 127));
    }

    return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

/** A white sleeve with a black drawing on it, as One Up has: what the controls on a cover have to survive. */
function whiteSleeve(): string {
    const canvas = document.createElement("canvas");

    canvas.width = 300;
    canvas.height = 300;

    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 300, 300);
    ctx.fillStyle = "#111111";
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 8;
    ctx.strokeRect(46, 60, 62, 62);
    ctx.font = "bold 44px sans-serif";
    ctx.fillText("?", 64, 107);
    ctx.beginPath();
    ctx.arc(190, 150, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillRect(150, 230, 60, 10);

    return canvas.toDataURL("image/png");
}

function pick(id: string, title: string, artists: string[], art: string, likeness: number, previewUrl?: string): FeedItem {
    return { type: "discover", data: { id, title, artists, album: title, imageUrl: art, likeness, previewUrl } };
}

function play(
    id: string, title: string, artist: string, art: string, username: string, minutesAgo: number,
    over: Partial<{ replayed: boolean; skipped: boolean; heard: number; explicit: boolean }> = {}, previewUrl?: string,
): FeedItem {
    return {
        type: "history",
        data: {
            userId: "u-" + username.toLowerCase(),
            username,
            timestamp: Date.now() - minutesAgo * 60e3,
            previewUrl,
            item: {
                track: {
                    id, name: title, artists: [{ id: "a-" + id, name: artist, url: "", uri: "" }],
                    duration: 240_000, explicit: !!over.explicit,
                    album: { id: "al-" + id, name: title, releaseDate: 0, artUrl: art },
                    type: "track", meta: { updatedAt: 0 },
                },
                sessionDuration: over.heard ?? 1,
                skipped: !!over.skipped,
                replayed: !!over.replayed,
            },
        },
    };
}

function pages(preview: string, white: string): FeedItem[][] {
    return [
        [
            { type: "alert", data: { id: "m1", alertType: "ListenerTypeChange", content: "Audiophile" } },
            pick("s1", "Nights", ["Frank Ocean"], ART.blonde, 0.91, preview),
            pick("s8", "One Up", ["A white sleeve"], white, 0.93, preview),
            play("s2", "Weird Fishes/Arpeggi", "Radiohead", ART.inrainbows, "Maya", 25, { replayed: true }, preview),
            pick("s3", "Alright", ["Kendrick Lamar"], ART.tpab, 1.7, preview),
            pick("s4", "Instant Crush", ["Daft Punk", "Julian Casablancas"], ART.ram, 0.78, preview),
            play("s5", "Save Your Tears", "The Weeknd", ART.afterhours, "Jon", 190, { heard: 0.64 }, preview),
        ],
        [
            // A reshuffled page repeats a song already shown; it should not come round again
            pick("s1", "Nights", ["Frank Ocean"], ART.blonde, 0.91, preview),
            pick("s6", "Cherry-coloured Funk", ["Cocteau Twins"], ART.depcherry, 0.84, preview),
            play("s7", "Lithium", "Nirvana", ART.nevermind, "Sam", 60 * 30, { skipped: true, explicit: true }, preview),
        ],
        [],
    ];
}

function Bench() {
    const params = useSearchParams();
    const state = params.get("state");
    const [glow, setGlow] = useState<string[] | null>(null);
    const [title, setTitle] = useState("#e9e7fb");

    const user = useMemo(() => ({
        getMyFYP: async () => [],
        getAuthHeaders: () => ({}),
        setSongAffinity: async (songId: string, affinity: number) => {
            console.log("[bench] affinity", songId, affinity);
            return true;
        },
        markFYPAlertViewed: async (id: string) => console.log("[bench] alert viewed", id),
    }) as unknown as User, []);

    const fetchPage = useMemo(() => {
        /*
         * Built on the first ask, not here.
         *
         * A useMemo body runs while rendering, and this page is pre-rendered on
         * the server like any other — where a canvas and an object URL do not
         * exist, so making the sleeve and the tone threw "document is not
         * defined". The first ask comes from an effect, which only runs in a
         * browser.
         */
        let feed: FeedItem[][] | null = null;

        return async (page: number) => {
            feed ??= (state === "empty" ? [[]] : pages(tone(), whiteSleeve()));

            if (state === "slow")
                await new Promise(resolve => setTimeout(resolve, 1500));

            return feed[page - 1] ?? [];
        };
    }, [state]);

    return (
        <ChakraProvider theme={theme}>
            <DarkMode>
                <DiscoverPage
                    user={user}
                    fetchPage={fetchPage}
                    forceCalm={params.get("calm") === "1"}
                    onPaletteChange={setGlow}
                    setComplementaryColour={setTitle}
                    openProfile={id => console.log("[bench] open profile", id)}
                />
                <BenchChrome title="Discover" page="discover" glow={glow ?? undefined} />
                <span data-title-colour={title} hidden />
            </DarkMode>
        </ChakraProvider>
    );
}

export default function Page() {
    return <Suspense><Bench /></Suspense>;
}
