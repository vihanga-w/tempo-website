import { background, extendTheme } from "@chakra-ui/react";

export const theme = extendTheme({
    initialColorMode: "dark",
    useSystemColorMode: false,
    colors: {
      bg: {
        dark: '#000000',
        light: '#000000',
      },
      text: {
        dark: "#ffffff",
        light: "#ffffff",
      },
      primary: {
        dark: "#5786FF",
        light: "#0030A8",
      },
      secondary: {
        dark: "#5A5766",
        light: "#9C99A8",
      },
      accent: {
        dark: "#A480FF",
        light: "#240080",
      },
      popover: {
        dark: "#29253B",
        light: "#DCD9E5",
      }
    },
    body: {
      height: "100%",
      background: "#000000",
    }
});