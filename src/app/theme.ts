import { background, extendTheme } from "@chakra-ui/react";

export const theme = extendTheme({
    initialColorMode: "dark",
    useSystemColorMode: false,
    colors: {
      bg: {
        dark: '#0D0D0E',
      },
      text: {
        dark: "#ffffff",
        color: "#E9E7FB"
      },
      primary: {
        dark: "#3B44FF",
      },
      secondary: {
        dark: "#5A5766",
      },
      accent: {
        dark: "#A480FF",
      },
      popover: {
        dark: "#29253B",
      }
    },
    body: {
      height: "100%",
      background: "#0D0D0E",
    },
    styles: {
      global: {
        /*
         * Nothing on screen is text to be selected. A long press in the web view
         * otherwise starts a selection that floods the whole page — and with
         * buttons that act on release, pressing and holding is an ordinary thing
         * to do. The body did ask for this, but as an inline style, which React
         * writes unprefixed and the iOS web view ignores; here it goes through
         * Emotion, which adds the -webkit- form WebKit actually reads. The
         * long-press callout (copy, look up, share) goes with it.
         */
        "html, body, *": {
          WebkitUserSelect: "none",
          userSelect: "none",
          WebkitTouchCallout: "none",
        },
        /* Except where there is something to type: those still select and paste. */
        "input, textarea, [contenteditable='true'], [contenteditable='']": {
          WebkitUserSelect: "text",
          userSelect: "text",
          WebkitTouchCallout: "default",
        },
      },
    },
});