import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import PlaylistsPage from "./playlists-page";
import type User from "@/lib/usrlib";
import { PlaylistNeedsSignInError, type Playlist, type PlaylistSummary } from "@/lib/playlists";

vi.mock("@/lib/native-haptics", () => ({
    feedback: vi.fn(),
    feelPattern: vi.fn(),
}));

const NOW = Date.now();
const HOUR = 3600e3;

function summary(over: Partial<PlaylistSummary> = {}): PlaylistSummary {
    return { id: "aaaaaaaaaaaaaaaa", name: "Sunday morning", recipe: "mix", createdAt: NOW - HOUR, updatedAt: NOW - HOUR, songCount: 2, ...over };
}

function playlist(over: Partial<Playlist> = {}): Playlist {
    return {
        id: "aaaaaaaaaaaaaaaa",
        name: "Sunday morning",
        recipe: "mix",
        createdAt: NOW - HOUR,
        updatedAt: NOW - HOUR,
        songs: [
            { id: "s1", title: "Nights", artists: ["Frank Ocean"], imageUrl: "/art/a.jpg", reason: { type: "liked", at: NOW - 2 * HOUR, strength: 4 }, addedAt: NOW },
            { id: "s2", title: "Weird Fishes", artists: ["Radiohead"], imageUrl: "/art/b.jpg", reason: { type: "friend", userId: "u-maya", username: "Maya", how: "repeat", at: NOW - HOUR, others: 0 }, addedAt: NOW },
        ],
        ...over,
    };
}

/**
 * The page lists what Tempo has made, opens one with every song's reason
 * under its name, and does the few things that can be done to a playlist —
 * without ever showing a raw failure where a sentence will do.
 */
describe("the playlists page", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    const mount = (over: Partial<Record<keyof User, unknown>> = {}, props: { openCreate?: () => void; openProfile?: (id: string) => void } = {}) => {
        const user = {
            getPlaylists: vi.fn().mockResolvedValue([summary()]),
            getPlaylist: vi.fn().mockResolvedValue(playlist()),
            removeFromPlaylist: vi.fn().mockResolvedValue(playlist({ songs: playlist().songs.slice(1) })),
            refreshPlaylist: vi.fn().mockResolvedValue(playlist()),
            sendPlaylistToSpotify: vi.fn().mockResolvedValue(playlist({ spotify: { id: "sp", url: "https://open.spotify.com/playlist/sp", syncedAt: NOW } })),
            deletePlaylist: vi.fn().mockResolvedValue(undefined),
            ...over,
        };

        render(<PlaylistsPage user={user as unknown as User} {...props} />);

        return user;
    };

    it("lists the playlists, and opens one with the reason under every song", async () => {
        const user = mount();

        fireEvent.click(await screen.findByRole("button", { name: "Open Sunday morning" }));

        expect(user.getPlaylist).toHaveBeenCalledWith("aaaaaaaaaaaaaaaa");
        expect(await screen.findByText("Nights")).toBeTruthy();
        expect(screen.getByText(/You liked this in Discover/)).toBeTruthy();
        expect(screen.getByText(/Maya had this on repeat/)).toBeTruthy();
    });

    it("takes a song out, and shows the playlist as the server now has it", async () => {
        const user = mount();

        fireEvent.click(await screen.findByRole("button", { name: "Open Sunday morning" }));
        fireEvent.click(await screen.findByRole("button", { name: "Take Nights out" }));

        expect(user.removeFromPlaylist).toHaveBeenCalledWith("aaaaaaaaaaaaaaaa", "s1");
        await waitFor(() => expect(screen.queryByText("Nights")).toBeNull());
        expect(screen.getByText("Weird Fishes")).toBeTruthy();
    });

    it("says in words when Spotify needs a sign-in, rather than failing", async () => {
        const words = "Tempo needs one more permission to write to your Spotify. Sign in again and it will ask for it.";

        mount({ sendPlaylistToSpotify: vi.fn().mockRejectedValue(new PlaylistNeedsSignInError(words)) });

        fireEvent.click(await screen.findByRole("button", { name: "Open Sunday morning" }));
        fireEvent.click(await screen.findByRole("button", { name: "Send to Spotify ›" }));

        expect(await screen.findByRole("status")).toHaveProperty("textContent", words);
        // And the way to do what it says
        expect(screen.getByRole("button", { name: "Sign in again ›" })).toBeTruthy();
    });

    it("tells a list it could not read apart from a list with nothing in it", async () => {
        const user = mount({ getPlaylists: vi.fn().mockRejectedValueOnce(new Error("The server is away")).mockResolvedValue([]) });

        expect(await screen.findByText("Could not read your playlists")).toBeTruthy();
        expect(screen.getByText("The server is away")).toBeTruthy();
        expect(screen.queryByText("No playlists yet")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Try again ›" }));

        expect(user.getPlaylists).toHaveBeenCalledTimes(2);
        expect(await screen.findByText("No playlists yet")).toBeTruthy();
    });

    it("opens the playlist tapped last, whichever answers first", async () => {
        let answerA: (p: Playlist) => void = () => {};
        const user = mount({
            getPlaylists: vi.fn().mockResolvedValue([summary(), summary({ id: "bbbbbbbbbbbbbbbb", name: "Late night" })]),
            getPlaylist: vi.fn().mockImplementation((id: string) => (id === "aaaaaaaaaaaaaaaa"
                ? new Promise<Playlist>(resolve => { answerA = resolve; })
                : Promise.resolve(playlist({ id: "bbbbbbbbbbbbbbbb", name: "Late night" })))),
        });

        fireEvent.click(await screen.findByRole("button", { name: "Open Sunday morning" }));
        fireEvent.click(screen.getByRole("button", { name: "Open Late night" }));

        expect(await screen.findByText("Late night")).toBeTruthy();

        // The first tap's answer arrives late, and is dropped
        answerA(playlist());
        await new Promise(r => setTimeout(r, 0));

        expect(user.getPlaylist).toHaveBeenCalledTimes(2);
        expect(screen.queryByText("Sunday morning")).toBeNull();
        expect(screen.getByText("Late night")).toBeTruthy();
    });

    it("does not reopen a playlist the reader has left while a change was in flight", async () => {
        let answer: (p: Playlist) => void = () => {};

        mount({ refreshPlaylist: vi.fn().mockImplementation(() => new Promise<Playlist>(resolve => { answer = resolve; })) });

        fireEvent.click(await screen.findByRole("button", { name: "Open Sunday morning" }));
        fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
        fireEvent.click(screen.getByRole("button", { name: "‹ Playlists" }));

        expect(await screen.findByRole("button", { name: "Open Sunday morning" })).toBeTruthy();

        answer(playlist());
        await new Promise(r => setTimeout(r, 0));

        expect(screen.getByRole("button", { name: "Open Sunday morning" })).toBeTruthy();
        expect(screen.queryByText("Nights")).toBeNull();
    });

    it("offers the way out of Spotify once a copy exists there", async () => {
        mount();

        fireEvent.click(await screen.findByRole("button", { name: "Open Sunday morning" }));
        fireEvent.click(await screen.findByRole("button", { name: "Send to Spotify ›" }));

        expect(await screen.findByRole("button", { name: "Open in Spotify ›" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Update on Spotify" })).toBeTruthy();
    });

    it("asks before deleting, and goes back to the list after", async () => {
        const user = mount();

        fireEvent.click(await screen.findByRole("button", { name: "Open Sunday morning" }));
        fireEvent.click(await screen.findByRole("button", { name: "Delete playlist" }));

        // Nothing has gone yet: the ask is the second button
        expect(user.deletePlaylist).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Delete it" }));

        expect(user.deletePlaylist).toHaveBeenCalledWith("aaaaaaaaaaaaaaaa");
        expect(await screen.findByText("No playlists yet")).toBeTruthy();
    });

    it("with nothing made yet, says what playlists are for and offers to make one", async () => {
        const openCreate = vi.fn();

        mount({ getPlaylists: vi.fn().mockResolvedValue([]) }, { openCreate });

        fireEvent.click(await screen.findByRole("button", { name: "Make one ›" }));

        expect(openCreate).toHaveBeenCalled();
    });
});
