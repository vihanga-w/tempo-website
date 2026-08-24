"use client";

import { ColorModeScript } from "@chakra-ui/react";
import { theme } from "./theme";

/**
 * The colour mode script, on the client side of the boundary.
 *
 * layout.tsx is a server component, and reaching for the theme from there pulls
 * extendTheme into the server bundle, where Chakra does not exist — the whole
 * app renders as "extendTheme is not a function". This is still rendered during
 * SSR, so the blocking script lands in the markup exactly as it did before and
 * the first paint is still the right colour mode.
 */
export function InitialColorMode() {
    return <ColorModeScript initialColorMode={theme.initialColorMode} />;
}
