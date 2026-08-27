import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { theme } from "@/app/theme";
import { FriendRecentActivityRow } from "./friend-recent-activity-row";
import type { FriendRecentActivity } from "@/lib/usrlib";

afterEach(cleanup);

const activity: FriendRecentActivity = {
    userId: "friend-1",
    username: "Sorcha",
    tracks: [{
        songId: "t1",
        timestamp: 1_700_000_000_000,
        replayed: false,
        track: {
            id: "t1",
            name: "Duvet",
            artists: [{ id: "a1", name: "bôa", url: "", uri: "" }],
            duration: 227_000,
            explicit: false,
            album: { id: "al1", name: "Twilight", releaseDate: 0, artUrl: "https://example.invalid/art.jpg" },
            type: "track",
        },
    }] as unknown as FriendRecentActivity["tracks"],
    lastPlayedAt: 1_700_000_000_000,
    playCount: 3,
    onRepeat: false,
};

function renderRow() {
    const open = vi.fn();

    // The real theme, because the row draws a gradient that resolves against it
    render(<ChakraProvider theme={theme}>
        <FriendRecentActivityRow
            activity={activity}
            openPubProfile={open}
            now={activity.lastPlayedAt + 20 * 60e3}
        />
    </ChakraProvider>);

    return { open, row: screen.getByRole("button") };
}

/*
 * The row is styled as something you press and had a click handler and a label,
 * but it was a plain div: no role, no tab stop, no key handling. A screen reader
 * read out whose row it was and then offered no way to open it, and a keyboard
 * could not reach it at all. Caught in review after the branch merged.
 */
describe("FriendRecentActivityRow, reached without a pointer", () => {
    it("is announced as a button", () => {
        const { row } = renderRow();

        expect(row).toBeTruthy();
        expect(row.getAttribute("aria-label")).toContain("Sorcha");
    });

    it("can be tabbed to", () => {
        const { row } = renderRow();

        expect(row.getAttribute("tabindex")).toBe("0");
    });

    it("opens on Enter", () => {
        const { open, row } = renderRow();

        fireEvent.keyDown(row, { key: "Enter" });

        expect(open).toHaveBeenCalledWith("friend-1");
    });

    it("opens on Space", () => {
        const { open, row } = renderRow();

        fireEvent.keyDown(row, { key: " " });

        expect(open).toHaveBeenCalledWith("friend-1");
    });

    it("ignores a key that is not meant to press it", () => {
        const { open, row } = renderRow();

        fireEvent.keyDown(row, { key: "a" });
        fireEvent.keyDown(row, { key: "Tab" });

        expect(open).not.toHaveBeenCalled();
    });

    it("still opens on a click", () => {
        const { open, row } = renderRow();

        fireEvent.click(row);

        expect(open).toHaveBeenCalledWith("friend-1");
    });
});
