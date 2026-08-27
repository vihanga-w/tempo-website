import { background, extendTheme } from "@chakra-ui/react";

export const theme = extendTheme({
    /*
     * Every drawer and the friends page reserve space at the bottom with
     * `var(--safe-area-inset-bottom)`, and nothing defined it — so all of them
     * fell back to 0px and sat under the home indicator. Defined here because
     * this is the app's only global style entry point.
     */
    styles: {
      global: {
        ":root": {
          "--safe-area-inset-bottom": "env(safe-area-inset-bottom, 0px)",
          "--safe-area-inset-top": "env(safe-area-inset-top, 0px)",
        },
      },
    },
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
    }
});