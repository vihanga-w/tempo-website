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
    }
});