import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { theme } from "@/app/theme";
import { FeedItem } from "@/lib/usrlib";
import MusicDiscoveryFeed, { Song as FeedItemSong } from "./music-discovery-feed";

interface Nav {
    setPubProfileUserId: (userId: string) => void;
    pageChanger: (page: string, returnPage: string) => void;
}

/*
 * The feed pulls in an audio-preview player, a YouTube background and a
 * confetti burst, none of which jsdom can run and none of which these cases are
 * about. Stubbed here rather than in a setup file so it is obvious from the
 * test what is standing in for what.
 */
vi.mock("youtube-bg-react", () => ({ default: () => null }));
vi.mock("canvas-confetti", () => ({ default: () => {} }));

afterEach(cleanup);

const user = {
    id: "me",
    object: { id: "me" },
    getAuthHeaders: () => ({}),
    setSongAffinity: async () => true,
    markFYPAlertViewed: () => {},
};

// A real 1x1 gif. The colour extractor logs an error for an empty src, and a
// test should not be the thing that produces it.
const ART = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const song = (id: string, from?: FeedItemSong["from"]): FeedItem => ({
    type: "discover",
    data: {
        id, title: "Weird Fishes / Arpeggi", artists: ["Radiohead"],
        album: "In Rainbows", imageUrl: ART, likeness: 1.5, from,
    },
});

const render = (feed: FeedItem[], nav: Partial<Nav> = {}) =>
    rtlRender(
        <ChakraProvider theme={theme}>
            <MusicDiscoveryFeed
                user={user as never}
                feed={feed}
                loadMore={() => {}}
                type="discover"
                streamer={null}
                setPubProfileUserId={nav.setPubProfileUserId}
                pageChanger={nav.pageChanger}
            />
        </ChakraProvider>
    );

/*
 * Two different nothings.
 *
 * A feed that arrived empty and a feed that has been swiped dry both leave the
 * internal list at zero, and both messages were keyed off that — so an empty
 * Discover rendered the explanation and "You reached the end of your For You
 * page" stacked on top of one another, overlapping and unreadable. Which of the
 * two it is has to be decided by whether there was ever anything to reach the
 * end of.
 */
describe("an empty Discover", () => {
    it("explains where picks come from when the feed arrived empty", () => {
        render([]);

        expect(screen.getByText("Nothing new just yet")).toBeTruthy();
        expect(screen.queryByText(/reached the end/)).toBeNull();
    });

    /*
     * Settled, not first paint: the incoming feed is copied into internal state
     * by an effect, so on the very first render a populated feed still has an
     * empty internal list. That is the state both messages used to key off.
     */
    it("shows neither message once a populated feed has settled", async () => {
        render([song("a"), song("b")]);

        await waitFor(() => expect(screen.queryByText(/reached the end/)).toBeNull());
        expect(screen.queryByText("Nothing new just yet")).toBeNull();
    });
});

/*
 * Discover was mounted without either navigation prop, so the attribution row
 * on every card rendered as plain text and a tap went nowhere. Nothing failed
 * — the component simply does not offer the tap when it has no destination —
 * which is why the props are no longer optional and why this asserts on the
 * wiring rather than on the row in isolation.
 */
describe("tapping who a pick came from", () => {
    const from = {
        userId: "friend-1", username: "Sorcha",
        playedAt: Date.now() - 2 * 3600e3, familiarArtist: true,
    };

    it("opens that friend's profile", async () => {
        const setPubProfileUserId = vi.fn();
        const pageChanger = vi.fn();

        render([song("a", from)], { setPubProfileUserId, pageChanger });

        const row = await screen.findByRole("button", { name: /Open Sorcha's profile/ });
        fireEvent.click(row);

        expect(setPubProfileUserId).toHaveBeenCalledWith("friend-1");
        expect(pageChanger).toHaveBeenCalledWith("pub-profile", "discover");
    });

    it("does not pretend to be tappable with nowhere to send it", async () => {
        render([song("a", from)]);

        expect(await screen.findByText("Sorcha")).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Open Sorcha's profile/ })).toBeNull();
    });
});
