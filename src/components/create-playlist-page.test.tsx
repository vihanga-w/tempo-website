import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import CreatePlaylistPage from "./create-playlist-page";
import type User from "@/lib/usrlib";
import type { Playlist, PlaylistSong } from "@/lib/playlists";

vi.mock("@/lib/native-haptics", () => ({
    feedback: vi.fn(),
    feelPattern: vi.fn(),
}));

const NOW = Date.now();
const HOUR = 3600e3;

const songs: PlaylistSong[] = [
    { id: "s2", title: "Weird Fishes", artists: ["Radiohead"], imageUrl: "/art/b.jpg", reason: { type: "friend", userId: "u-maya", username: "Maya", how: "repeat", at: NOW - HOUR, others: 1 }, addedAt: NOW },
    { id: "s5", title: "Save Your Tears", artists: ["The Weeknd"], imageUrl: "/art/c.jpg", reason: { type: "friend", userId: "u-jon", username: "Jon", how: "through", at: NOW - 30 * HOUR, others: 0 }, addedAt: NOW },
];

/**
 * New Playlist shows what a recipe makes before asking for a name, keeps
 * exactly what it showed, and says plainly when a recipe finds nothing.
 */
describe("making a playlist", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    const mount = (over: Partial<Record<keyof User, unknown>> = {}) => {
        const onCreated = vi.fn();
        const user = {
            previewPlaylist: vi.fn().mockResolvedValue(songs),
            createPlaylist: vi.fn().mockImplementation(async (recipe: Playlist["recipe"], name: string): Promise<Playlist> =>
                ({ id: "bbbbbbbbbbbbbbbb", name, recipe, createdAt: NOW, updatedAt: NOW, songs })),
            ...over,
        };

        render(<CreatePlaylistPage user={user as unknown as User} onCreated={onCreated} />);

        return { user, onCreated };
    };

    it("previews a recipe as soon as it is chosen, and names the playlist after it", async () => {
        const { user } = mount();

        fireEvent.click(screen.getByRole("button", { name: "On repeat with friends" }));

        expect(user.previewPlaylist).toHaveBeenCalledWith("friends");
        expect(await screen.findByText("Weird Fishes")).toBeTruthy();
        expect(screen.getByText(/Maya had this on repeat and 1 other/)).toBeTruthy();
        expect(screen.getByRole("textbox", { name: "Playlist name" })).toHaveProperty("value", "On repeat with friends");
    });

    it("keeps it under the name typed, and hands the new playlist back", async () => {
        const { user, onCreated } = mount();

        fireEvent.click(screen.getByRole("button", { name: "Liked in Discover" }));
        await screen.findByText("Weird Fishes");

        fireEvent.change(screen.getByRole("textbox", { name: "Playlist name" }), { target: { value: "Swipes, September" } });
        fireEvent.click(screen.getByRole("button", { name: "Make it · 2 songs" }));

        expect(user.createPlaylist).toHaveBeenCalledWith("liked", "Swipes, September");
        await waitFor(() => expect(onCreated).toHaveBeenCalledWith("bbbbbbbbbbbbbbbb"));
    });

    it("says when a recipe finds nothing, and offers nothing to make", async () => {
        mount({ previewPlaylist: vi.fn().mockResolvedValue([]) });

        fireEvent.click(screen.getByRole("button", { name: "Songs you came back to" }));

        expect(await screen.findByText(/Nothing fits this recipe yet/)).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Make it/ })).toBeNull();
    });

    it("can go back and choose another", async () => {
        const { user } = mount();

        fireEvent.click(screen.getByRole("button", { name: "Your mix" }));
        await screen.findByText("Weird Fishes");
        fireEvent.click(screen.getByRole("button", { name: "‹ Choose another" }));
        fireEvent.click(screen.getByRole("button", { name: "Liked in Discover" }));

        expect(user.previewPlaylist).toHaveBeenLastCalledWith("liked");
    });
});
