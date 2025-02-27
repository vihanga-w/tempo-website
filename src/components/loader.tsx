import { Box, Image } from "@chakra-ui/react";

export function Loader() {
    return (<>
        <Box background="#000000" width="100vw" height="100vh">
            <Image src="/icons/ui/logo-clear.svg" />
        </Box>
    </>);
}