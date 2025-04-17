import { Capacitor } from "@capacitor/core";
import { Box, Center, Image, Stack } from "@chakra-ui/react";

export function Loader() {
    return (<>
        {Capacitor.isNativePlatform() ? (
            <Box background="#0D0D0E" width="100vw" height="100vh" />
        ) : (<>
            <style>
                {`.loader {
                width: 100vw;
                height: 16px;
                border: none;
                background: repeating-linear-gradient(-45deg,#fff 0 15px,#0000 0 26px) left/200% 100%;
                animation: l3 2.5s infinite linear;
                }
                @keyframes l3 {
                    100% {background-position:right}
                }`}
            </style>
            <Box background="#0D0D0E">
                <Center width="100vw" height="100vh">
                    <Image width="100px" src="/icons/ui/logo-clear.svg" loading="lazy" />
                </Center>
                <Box pos="absolute" bottom="0" left="0" className="loader" />
            </Box>
        </>)}
    </>);
}