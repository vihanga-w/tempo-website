"use client";

// Inter from the package rather than from Google Fonts, so the preview shows the
// real typeface even where the font CDN is unreachable
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import { ChakraProvider, DarkMode } from "@chakra-ui/react";
import { theme } from "../theme";
import ProfilePage from "@/components/profile-page";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
TimeAgo.addDefaultLocale(en);
TimeAgo.addLocale(en);
const COVERS: Record<string, string> = {
    blonde: "/art/art-blonde.jpg",
    inrainbows: "/art/art-inrainbows.jpg",
    ram: "/art/art-ram.jpg",
    tpab: "/art/art-tpab.jpg",
    nevermind: "/art/art-nevermind.jpg",
    afterhours: "/art/art-afterhours.jpg",
    depcherry: "/art/art-depcherry.jpg",
};
function makeStreamer(playing: boolean, ART: string): any {
    const state = { userId: "u1", data: { action: { type: "PLAYING" }, interpolatedProgress: 0.42, state: {
        songId: "s1", name: "Nights", username: "Frank", pfpUrl: "", artists: [{ name: "Frank Ocean" }],
        imageUrl: ART, duration: 307000, progressNormal: 0.42, explicit: true, isPlaying: true, mediaType: "track",
        playSessionStart: Date.now() - 74 * 60e3, replayCount: 0, displaySeed: 0.2,
        todayStats: { completeListenCount: 7, totalSessionDuration: 6 } } } };
    const handlers: Record<string, Function[]> = {};
    return { isOpen: true, isReady: () => true, init: () => {}, cleanup: () => {},
        getPrevState: () => (playing ? state : undefined),
        detachedListeningStateQuery: () => { if (playing) setTimeout(() => (handlers["update"] ?? []).forEach(h => h(state)), 60); return playing; },
        on: (ev: string, cb: Function) => { (handlers[ev] ??= []).push(cb); if (playing && (ev === "update" || ev === "update-u1")) setTimeout(() => cb(state), 80); },
        off: (ev: string, cb: Function) => { handlers[ev] = (handlers[ev] ?? []).filter(h => h !== cb); } };
}
function song(ART: string, i: number, title: string, artists: string[], playCount: number, explicit = false) {
    return { id: "t" + i, title, artists, index: i, explicit, playCount, imageUrl: ART };
}
// Every mocked fetch is logged, so a check on the console can tell whether the
// page asks for the same thing twice
const calls: string[] = [];
if (typeof window !== "undefined") (window as any).__calls = calls;

function makeUser(variant: string, ART: string): any {
    const empty = variant === "empty";
    // A real blob, produced exactly as the server does: sharp resize to 4x4,
    // removeAlpha, raw, base64. Lets the placeholder be seen without a backend.
    const BLOB = "NUA5PUhJkmpDmWRFJzExj15F2XdBe0AlRjojxXY2uHkpPS8OMiYqejM1Zi8oJBoc";
    const me = { id: "u1", displayName: "Vihanga Weerasinghe",
        images: [{ url: ART, width: 300, height: 300 }],
        profilePictureColourBlob: BLOB,
        listenerTypeClassification: "Nocturnal Explorer" };
    return { id: "u1", isLoggedIn: true, object: me,
        getRemoteUser: async () => me,
        getRecaps: async () => ({ daily: { a: 1 }, weekly: null }),
        getRemoteUserPastWeekStats: async () => (calls.push("pastWeekStats"), empty
            ? { totalListeningDuration: 0, uniqueSongsPlayedCount: 0, longestStreak: 0 }
            : { totalListeningDuration: 15_120_000, uniqueSongsPlayedCount: 38, longestStreak: 4_020_000 }),
        getRemoteUserTopSongs: async (_u: string, period: string) => (calls.push("topSongs:" + period), empty ? [] : [
            song(ART, 0, "Nights", ["Frank Ocean"], 12, true),
            song(ART, 1, "Weird Fishes / Arpeggi", ["Radiohead"], 9),
            song(ART, 2, "Sunset", ["The Midnight", "Nikki Flores"], 7),
            song(ART, 3, "Redbone", ["Childish Gambino"], 6, true),
            song(ART, 4, "Space Song", ["Beach House"], 5)]),
        getFriendProfileListenershipHistory: async (_u: string, page: number) => (empty ? { data: [], isFinalPage: true } : {
            data: [0, 1, 2, 3].map(i => ({ userId: "u1", username: "Vihanga", pfpUrl: "",
                timestamp: Date.now() - (page * 4 + i + 1) * 37 * 60e3,
                item: { track: { id: `h${page}-${i}`, name: ["Nights", "Weird Fishes / Arpeggi", "Redbone", "Space Song"][i],
                    type: "track", explicit: i % 2 === 0, duration: 307000,
                    artists: [{ name: ["Frank Ocean", "Radiohead", "Childish Gambino", "Beach House"][i] }],
                    album: { artUrl: ART } }, sessionDuration: 0.8, skipped: false, replayed: i === 2 } })),
            isFinalPage: page >= 1 }) };
}
function Preview() {
    const params = useSearchParams();
    const variant = params.get("v") ?? "playing";
    const ART = COVERS[params.get("art") ?? "inrainbows"] ?? COVERS.inrainbows;
    return (<ChakraProvider theme={theme}><DarkMode>
        <div style={{ background: "#0D0D0E", minHeight: "100vh", overflow: "auto", color: "#ffffff" }} data-profile-scroll-container>
            <ProfilePage key={variant + ART} user={makeUser(variant, ART) as any} pageChanger={() => {}}
                hideTopGradientCb={() => {}} setComplementaryColour={() => {}} setRecaps={() => {}}
                openRecapDrawer={() => {}} streamer={makeStreamer(variant === "playing", ART) as any} />
        </div>
    </DarkMode></ChakraProvider>);
}
export default function Page() { return <Suspense><Preview /></Suspense>; }
