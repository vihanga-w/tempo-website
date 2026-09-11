"use client";

/**
 * The shell's chrome, for the benches. Development only — nothing that ships
 * imports this, and the `.dev` in the name is there to say so.
 *
 * The point of it is that every bench gets the *same* chrome, and that the
 * parts which matter are the real ones: `GlassTopBar` is imported rather than
 * copied, so the glass on a bench is the glass in the app. Only the title is
 * restated here, because in the shell it is welded to the back chevron's
 * behaviour, which a bench has no use for.
 *
 * The title is deliberately drawn *over* the bar rather than under it. It is
 * the one thing on screen that must stay sharp: the bar exists to blur the page
 * scrolling beneath the title, and a blurred title would defeat it.
 */

import { Box, HStack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import GlassActionMenu, { type PinnedAction } from "./glass-action-menu";
import { GlassTopBar } from "./glass-top-bar";

/**
 * The space the shell leaves above a page's own content, in pixels.
 *
 * In the app this is not declared anywhere — it falls out of the row that holds
 * the title: 20px of padding, less 15px of negative top margin, plus 48px
 * below it. The row itself collapses to nothing, because everything in it is
 * positioned, so what reaches the page underneath is the 53px of box around it.
 *
 * A bench renders the page without that row, so it has to put the space back,
 * or the page's own first heading rides up under the title and the title looks
 * like it is colliding with the page rather than sitting above it.
 */
export const SHELL_CONTENT_OFFSET = 53;

export default function BenchChrome({
    title,
    page,
    scrolled,
    pinned,
    beside,
    glow,
}: Readonly<{
    /** What the shell would be showing as the page title. */
    title: string;
    /** The page id, so the menu can leave itself out of its own list. */
    page: string;
    /**
     * The shell's `hideTopGradient`. The profile page drives this off its own
     * accent colour, and it swaps the bar for its thin variant — so a bench
     * showing that page has to pass it through or it shows the wrong material.
     */
    scrolled?: boolean;
    /** The floating controls the real page would be given, so the cluster can be judged here. */
    pinned?: PinnedAction;
    beside?: PinnedAction;
    glow?: readonly string[];
}>) {
    const [menuOpen, setMenuOpen] = useState(false);

    /*
     * Both of these are the app entry point's job, and a bench opened straight
     * in the native shell never runs it.
     *
     * The safe area matters more than it looks: without it the insets are zero,
     * the title lands under the status bar and the button sits on the home
     * indicator — so a bench would misreport the very thing it exists to show.
     */
    useEffect(() => {
        import("@capacitor/splash-screen")
            .then(({ SplashScreen }) => SplashScreen.hide())
            .catch(() => { /* Not the native shell. */ });

        import("@capacitor-community/safe-area")
            .then(({ SafeArea, initialize }) => {
                initialize();
                return SafeArea.enable({
                    config: {
                        customColorsForSystemBars: true,
                        statusBarColor: "#0D0D0E",
                        statusBarContent: "dark",
                        navigationBarColor: "#0D0D0E",
                        navigationBarContent: "dark",
                    },
                });
            })
            .catch(() => { /* Not the native shell. */ });
    }, []);

    return (
        <>
            <GlassTopBar scrolled={scrolled} />

            {/*
              * Above the bar's 999, so the glass never touches it. In the shell
              * this sits at a far higher layer for the same reason.
              */}
            <Box
                position="fixed"
                top="env(safe-area-inset-top)"
                left="20px"
                zIndex="1000"
                pointerEvents="none"
            >
                <HStack gap="10px">
                    {/*
                      * No chevron. The shell only draws one on a sub-page, as a
                      * way back, and every bench is a top-level page.
                      */}
                    <Text
                        fontFamily="Libre Franklin"
                        fontWeight="black"
                        fontStyle="italic"
                        fontSize="36px"
                        color="#e9e7fb"
                        whiteSpace="nowrap"
                    >
                        {title}
                    </Text>
                </HStack>
            </Box>

            <GlassActionMenu
                open={menuOpen}
                setOpen={setMenuOpen}
                currentPage={page}
                pinned={pinned}
                beside={beside}
                glow={glow}
                onNavigate={() => { /* Nowhere to go from a bench. */ }}
            />
        </>
    );
}
