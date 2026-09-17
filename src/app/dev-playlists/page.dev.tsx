"use client";

/**
 * A bench for the playlist pages, with a user that keeps its playlists in
 * memory and answers every call at once.
 *
 *   /dev-playlists              the Playlists page, with two playlists kept
 *   /dev-playlists?state=empty  the same with none
 *   /dev-playlists?page=create  New Playlist
 *   ?slow=1                     every call takes a second, to see the skeletons
 */

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import { ChakraProvider, DarkMode } from "@chakra-ui/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { theme } from "../theme";
import BenchChrome from "@/components/bench-chrome.dev";
import PlaylistsPage from "@/components/playlists-page";
import CreatePlaylistPage from "@/components/create-playlist-page";
import type User from "@/lib/usrlib";
import { PlaylistNeedsSignInError, recipeNamed, type Playlist, type PlaylistRecipe, type PlaylistSong, type PlaylistSummary } from "@/lib/playlists";

const ART = {
    blonde: "/art/art-blonde.jpg",
    inrainbows: "/art/art-inrainbows.jpg",
    ram: "/art/art-ram.jpg",
    tpab: "/art/art-tpab.jpg",
    nevermind: "/art/art-nevermind.jpg",
    afterhours: "/art/art-afterhours.jpg",
    depcherry: "/art/art-depcherry.jpg",
};

const HOUR = 3600e3;
const DAY = 24 * HOUR;

function song(id: string, title: string, artists: string[], art: string, reason: PlaylistSong["reason"], explicit = false): PlaylistSong {
    return { id, title, artists, imageUrl: art, explicit, reason, addedAt: Date.now() - DAY };
}

function songsFor(recipe: PlaylistRecipe, now: number): PlaylistSong[] {
    const all: PlaylistSong[] = [
        song("s1", "Nights", ["Frank Ocean"], ART.blonde, { type: "liked", at: now - 2 * HOUR, strength: 4 }),
        song("s2", "Weird Fishes/Arpeggi", ["Radiohead"], ART.inrainbows, { type: "friend", userId: "u-maya", username: "Maya", how: "repeat", at: now - 25 * 60e3, others: 1 }),
        song("s3", "Alright", ["Kendrick Lamar"], ART.tpab, { type: "returned", days: 3, lastAt: now - 3 * HOUR }, true),
        song("s4", "Instant Crush", ["Daft Punk", "Julian Casablancas"], ART.ram, { type: "played", plays: 5, replays: 2, lastAt: now - DAY }),
        song("s5", "Save Your Tears", ["The Weeknd"], ART.afterhours, { type: "friend", userId: "u-jon", username: "Jon", how: "through", at: now - 30 * HOUR, others: 0 }),
        song("s6", "Cherry-coloured Funk", ["Cocteau Twins"], ART.depcherry, { type: "liked", at: now - 5 * DAY, strength: 2 }),
        song("s7", "Lithium", ["Nirvana"], ART.nevermind, { type: "friend", userId: "u-sam", username: "Sam", how: "played", at: now - 2 * DAY, others: 3 }, true),
    ];

    switch (recipe) {
        case "liked": return all.filter(v => v.reason.type === "liked");
        case "friends": return all.filter(v => v.reason.type === "friend");
        case "returned": return all.filter(v => v.reason.type === "returned" || v.reason.type === "played");
        case "mix": return all;
    }
}

function Bench() {
    const params = useSearchParams();
    const state = params.get("state");
    const page = params.get("page");
    const slow = params.get("slow") === "1";
    const [glow] = useState<string[] | null>(null);
    const [view, setView] = useState<"playlists" | "create">(page === "create" ? "create" : "playlists");

    useEffect(() => {
        setView(page === "create" ? "create" : "playlists");
    }, [page]);

    const user = useMemo(() => {
        const now = Date.now();
        const wait = () => (slow ? new Promise(resolve => setTimeout(resolve, 1000)) : Promise.resolve());
        const kept = new Map<string, Playlist>();

        if (state !== "empty") {
            kept.set("aaaaaaaaaaaaaaaa", { id: "aaaaaaaaaaaaaaaa", name: "Sunday morning", recipe: "mix", createdAt: now - 3 * DAY, updatedAt: now - 2 * HOUR, songs: songsFor("mix", now) });
            kept.set("bbbbbbbbbbbbbbbb", { id: "bbbbbbbbbbbbbbbb", name: "On repeat with friends", recipe: "friends", createdAt: now - 6 * DAY, updatedAt: now - DAY, songs: songsFor("friends", now), spotify: { id: "sp", url: "https://open.spotify.com/playlist/sp", syncedAt: now - DAY } });
        }

        const summary = (v: Playlist): PlaylistSummary => ({ id: v.id, name: v.name, recipe: v.recipe, createdAt: v.createdAt, updatedAt: v.updatedAt, songCount: v.songs.length, spotify: v.spotify });
        const need = (id: string) => {
            const found = kept.get(id);

            if (!found)
                throw new Error("No such playlist");

            return found;
        };

        return {
            getAuthHeaders: () => ({}),
            getPlaylists: async () => { await wait(); return [...kept.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(summary); },
            getPlaylist: async (id: string) => { await wait(); return need(id); },
            previewPlaylist: async (recipe: PlaylistRecipe) => { await wait(); return songsFor(recipe, Date.now()); },
            createPlaylist: async (recipe: PlaylistRecipe, name?: string) => {
                await wait();

                const id = Math.random().toString(16).slice(2, 18).padEnd(16, "0");
                const made: Playlist = { id, name: name?.trim() || recipeNamed(recipe).name, recipe, createdAt: Date.now(), updatedAt: Date.now(), songs: songsFor(recipe, Date.now()) };

                kept.set(id, made);
                console.log("[bench] made", made);

                return made;
            },
            removeFromPlaylist: async (id: string, songId: string) => {
                await wait();

                const found = need(id);
                const changed = { ...found, songs: found.songs.filter(v => v.id !== songId), updatedAt: Date.now() };

                kept.set(id, changed);

                return changed;
            },
            refreshPlaylist: async (id: string) => {
                await wait();

                const found = need(id);
                const changed = { ...found, updatedAt: Date.now() };

                kept.set(id, changed);

                return changed;
            },
            sendPlaylistToSpotify: async (id: string) => {
                await wait();

                if (state === "reauth")
                    throw new PlaylistNeedsSignInError("Tempo needs one more permission to write to your Spotify. Sign in again and it will ask for it.");

                const found = need(id);
                const changed: Playlist = { ...found, spotify: { id: "sp-" + id, url: "https://open.spotify.com/playlist/sp-" + id, syncedAt: Date.now() } };

                kept.set(id, changed);

                return changed;
            },
            deletePlaylist: async (id: string) => { await wait(); return kept.delete(id); },
        } as unknown as User;
    }, [slow, state]);

    return (
        <ChakraProvider theme={theme}>
            <DarkMode>
                {view === "create" ? (
                    <CreatePlaylistPage user={user} onCreated={id => { console.log("[bench] created", id); setView("playlists"); }} />
                ) : (
                    <PlaylistsPage user={user} openCreate={() => setView("create")} openProfile={id => console.log("[bench] open profile", id)} />
                )}
                <BenchChrome title={view === "create" ? "Create Playlist" : "Playlists"} page={view === "create" ? "create-playlist" : "playlists"} glow={glow ?? undefined} />
            </DarkMode>
        </ChakraProvider>
    );
}

export default function Page() {
    return <Suspense><Bench /></Suspense>;
}
