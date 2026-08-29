import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { theme } from "@/app/theme";
import { FeedItem } from "@/lib/usrlib";
import MusicDiscoveryFeed from "./music-discovery-feed";

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

const song = (id: string): FeedItem => ({
    type: "discover",
    data: {
        id, title: "Weird Fishes / Arpeggi", artists: ["Radiohead"],
        album: "In Rainbows", imageUrl: "", likeness: 1.5,
    },
});

const render = (feed: FeedItem[]) =>
    rtlRender(
        <ChakraProvider theme={theme}>
            <MusicDiscoveryFeed
                user={user as never}
                feed={feed}
                loadMore={() => {}}
                type="discover"
                streamer={null}
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
