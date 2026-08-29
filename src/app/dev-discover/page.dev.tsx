"use client";

/*
 * The Discover feed, without a backend.
 *
 * Same harness as /dev-preview: a `page.dev.tsx` that next.config.mjs only
 * treats as a route outside a production build, so it is never exported to the
 * public site. It exists so the friend-attributed card, the new-artist badge
 * and the empty state can be looked at — and screenshotted — without four
 * accounts listening to things.
 *
 * Variants, via ?v=
 *   friends  every pick came from a friend, which is the normal case
 *   mixed    friend picks alongside a taste-profile pick, whose card keeps the
 *            match percentage the friend cards drop
 *   thin     one friend, one pick
 *   empty    nobody has played anything
 *
 * ?real=1 fetches /discover-fixture.json — real picks, produced by running the
 * shipped ranker over a real group. That file is not committed.
 */

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import { ChakraProvider, DarkMode } from "@chakra-ui/react";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { theme } from "../theme";
import MusicDiscoveryFeed, { Song } from "@/components/music-discovery-feed";
import { FeedItem } from "@/lib/usrlib";

const HOUR = 3600e3;

// Public-domain-ish cover art already in the repo's dev asset set, so the page
// renders the same with the network off.
const ART = {
    blonde: "/art/art-blonde.jpg",
    inrainbows: "/art/art-inrainbows.jpg",
    ram: "/art/art-ram.jpg",
    tpab: "/art/art-tpab.jpg",
    nevermind: "/art/art-nevermind.jpg",
    afterhours: "/art/art-afterhours.jpg",
    depcherry: "/art/art-depcherry.jpg",
};

const FRIENDS = [
    { userId: "f-sorcha", username: "Sorcha", pfpUrl: undefined },
    { userId: "f-vonga", username: "Vonga", pfpUrl: undefined },
    { userId: "f-dylan", username: "dylan", pfpUrl: undefined },
    { userId: "f-vidhu", username: "Vidhu", pfpUrl: undefined },
];

function pick(
    i: number, title: string, artists: string[], album: string, art: string,
    friend: number, agoMs: number, familiarArtist: boolean,
): Song {
    return {
        id: "demo-" + i, title, artists, album, imageUrl: art,
        likeness: 1 + (8 - i) / 8,
        from: { ...FRIENDS[friend], playedAt: Date.now() - agoMs, familiarArtist },
    };
}

const PICKS: Song[] = [
    pick(0, "Weird Fishes / Arpeggi", ["Radiohead"], "In Rainbows", ART.inrainbows, 0, 22 * 60e3, true),
    pick(1, "Nights", ["Frank Ocean"], "Blonde", ART.blonde, 1, 2 * HOUR, false),
    pick(2, "Instant Crush", ["Daft Punk", "Julian Casablancas"], "Random Access Memories", ART.ram, 2, 5 * HOUR, true),
    pick(3, "Alright", ["Kendrick Lamar"], "To Pimp a Butterfly", ART.tpab, 3, 9 * HOUR, false),
    pick(4, "Something in the Way", ["Nirvana"], "Nevermind", ART.nevermind, 0, 26 * HOUR, false),
    pick(5, "Out of Time", ["The Weeknd"], "Dawn FM", ART.afterhours, 1, 2 * 24 * HOUR, true),
];

// No `from`, so this one keeps the match percentage — the whole point of
// suppressing it on the others is that the two kinds of pick read differently.
const TASTE_PICK: Song = {
    id: "demo-taste", title: "Enjoy the Silence", artists: ["Depeche Mode"],
    album: "Violator", imageUrl: ART.depcherry, likeness: 0.87,
};

function useSongs(variant: string, real: boolean): Song[] | null {
    const [remote, setRemote] = useState<Song[] | null>(null);

    useEffect(() => {
        if (!real) return;
        fetch("/discover-fixture.json")
            .then(r => r.json())
            .then(setRemote)
            .catch(() => setRemote([]));
    }, [real]);

    if (real) return remote;
    if (variant === "empty") return [];
    if (variant === "thin") return [PICKS[0]];
    if (variant === "mixed") return [TASTE_PICK, ...PICKS];
    return PICKS;
}

/** Only the handful of members the feed actually reaches for on this path. */
const user = {
    id: "me", isLoggedIn: true, object: { id: "me", displayName: "You" },
    getAuthHeaders: () => ({}),
    setSongAffinity: async (songId: string, affinity: number) => {
        console.log("setSongAffinity", songId, affinity.toFixed(2));
        return true;
    },
    markFYPAlertViewed: () => {},
};

function Preview() {
    const params = useSearchParams();
    const variant = params.get("v") ?? "friends";
    // Which card to open on. The feed advances by drag, which a screenshot
    // cannot perform, so the list is rotated instead — the component is given a
    // different feed, not driven into a different state.
    const first = Number(params.get("i") ?? 0);
    const all = useSongs(variant, params.get("real") === "1");
    const songs = all && first > 0 && first < all.length
        ? [...all.slice(first), ...all.slice(0, first)]
        : all;

    // The preview asks for no previews and no music videos: those are the only
    // two things on this path that need a live API, and a demo should not be
    // waiting on 401s to finish rendering.
    useEffect(() => {
        const real = window.fetch;
        window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
            if (url.includes("/audio/preview/") || url.includes("/audio/musicvideo/"))
                return Promise.resolve(new Response("", { status: 404 }));
            return real(input as RequestInfo, init);
        }) as typeof window.fetch;
        return () => { window.fetch = real; };
    }, []);

    // The feed reads window.innerHeight during render, so it cannot be server
    // rendered. The app mounts it behind a client-side route; the preview has to
    // hold it back by hand or every load logs a ReferenceError.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted || songs === null) return null;

    const feed: FeedItem[] = songs.map(data => ({ type: "discover", data }));

    return (
        <ChakraProvider theme={theme}><DarkMode>
            <div style={{ background: "#0D0D0E", height: "100vh", color: "#fff" }}>
                <MusicDiscoveryFeed
                    key={variant + first + songs.length}
                    user={user as never}
                    feed={feed}
                    loadMore={() => {}}
                    type="discover"
                    streamer={null}
                    setPubProfileUserId={id => console.log("open profile", id)}
                    pageChanger={(page, from) => console.log("pageChanger", page, from)}
                />
            </div>
        </DarkMode></ChakraProvider>
    );
}

export default function Page() { return <Suspense><Preview /></Suspense>; }
