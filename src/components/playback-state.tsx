import { Box, HStack, Image, Stack, Text } from "@chakra-ui/react";

export function PlaybackState() {
    return (<Stack gap="8px" width="100%">
        <HStack>
            <Image width="64px" borderRadius="6px" src="https://i.scdn.co/image/ab67616d00001e02d3ee4bf67c2ac2154006ad72" />
            <Stack gap="0" fontFamily="arial, helvetica" lineHeight="18px">
                <Text fontSize="18px" fontWeight="bold">Vonga</Text>
                <Text>Call Me Maybe</Text>
                <Text>Carly Rae Jepsen</Text>
            </Stack>
        </HStack>
        <Box
            width="100%"
            height="8px"
            background="rgba(255, 255, 255, 0.25)"
            borderRadius="8px"
            pos="absolute"
            left="0"
            top="0"
        >
            {/* Playback progress bar */}
            <Box
                width="20%"
                height="8px"
                background="skyblue"
                borderRadius="8px"
            />
        </Box>
    </Stack>);
}