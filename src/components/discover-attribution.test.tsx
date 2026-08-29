import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { theme } from "@/app/theme";
import { DiscoverAttribution, DiscoverSource, NewArtistBadge } from "./discover-attribution";

afterEach(cleanup);

// Sixteen red pixels — the 4x4 the server sends, as it sends it.
const RED_BLOB = Buffer.from(new Array(16).fill([220, 20, 20]).flat()).toString("base64");

/*
 * The avatar fallback paints a gradient, which Chakra resolves against the
 * theme. Rendered bare it reads the gradient's own text as a token path and
 * throws on "colors.150deg", so these go through the provider the app uses.
 */
const render = (ui: React.ReactElement) =>
    rtlRender(<ChakraProvider theme={theme}>{ui}</ChakraProvider>);

const source = (over: Partial<DiscoverSource> = {}): DiscoverSource => ({
    userId: "friend-1",
    username: "Sorcha",
    playedAt: Date.now() - 2 * 3600e3,
    familiarArtist: true,
    ...over,
});

describe("DiscoverAttribution", () => {
    it("names the friend and when they played it", () => {
        render(<DiscoverAttribution source={source()} colour="#fff" />);

        expect(screen.getByText("Sorcha")).toBeTruthy();
        expect(screen.getByText(/2h ago/)).toBeTruthy();
    });

    it("falls back to an initial avatar when a friend has no picture", () => {
        const { container } = render(<DiscoverAttribution source={source()} colour="#fff" />);

        expect(container.querySelector("img")).toBeNull();
    });

    /*
     * The picture carries no information the name beside it does not, so its alt
     * is empty and its role is presentation rather than img. That is deliberate:
     * a screen reader should hear the name once, not the name and "Sorcha".
     */
    it("shows the picture when there is one, as decoration", () => {
        const { container } = render(<DiscoverAttribution
            source={source({ pfpUrl: "https://example.test/a.jpg" })} colour="#fff" />);

        const img = container.querySelector("img");

        expect(img).not.toBeNull();
        expect(img?.getAttribute("alt")).toBe("");
    });

    /*
     * The server sends four bytes of that person's colours with every pick. The
     * row used to render a bare <img> and drop them, so the avatar popped in
     * from blank; the history card in the same feed has always used them.
     */
    it("holds the friend's colours while their picture loads", () => {
        const { container } = render(<DiscoverAttribution
            source={source({ pfpUrl: "https://example.test/a.jpg", pfpColourBlob: RED_BLOB })}
            colour="#fff" />);

        const placeholder = [...container.querySelectorAll("div")]
            .find(element => element.style.backgroundImage.includes("radial-gradient"));

        expect(placeholder).toBeTruthy();
        // Whitespace between the channels is up to whoever serialised it
        expect(placeholder!.style.backgroundImage).toMatch(/rgb\(\s*220,\s*20,\s*20\s*\)/);
    });

    it("opens the friend's profile when tapped", () => {
        const onOpenProfile = vi.fn();

        render(<DiscoverAttribution source={source()} colour="#fff" onOpenProfile={onOpenProfile} />);
        fireEvent.click(screen.getByRole("button"));

        expect(onOpenProfile).toHaveBeenCalledWith("friend-1");
    });

    it("opens on the keyboard too, since it is a div rather than a button", () => {
        const onOpenProfile = vi.fn();

        render(<DiscoverAttribution source={source()} colour="#fff" onOpenProfile={onOpenProfile} />);
        fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });

        expect(onOpenProfile).toHaveBeenCalledWith("friend-1");
    });

    /*
     * Without a handler the row is decoration. Announcing it as a button would
     * promise an action that never happens.
     */
    it("is not announced as a control when there is nowhere to go", () => {
        render(<DiscoverAttribution source={source()} colour="#fff" />);

        expect(screen.queryByRole("button")).toBeNull();
    });
});

describe("NewArtistBadge", () => {
    it("says what it is", () => {
        render(<NewArtistBadge colour="#fff" />);

        expect(screen.getByText("NEW ARTIST")).toBeTruthy();
    });
});
