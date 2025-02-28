import { Box, HStack, Image, Stack, Text } from "@chakra-ui/react";
import { MdExplicit } from "react-icons/md";

export function PlaybackState({
    isExplicit,
}: {
    isExplicit: boolean,
}) {
    return (
        <Stack gap="8px" width="100%">
            <HStack>
                <Image width="24px" borderRadius="6px" src="https://1.gravatar.com/avatar/c7b569fc39c774d98e7427fa5bb5e9b1b5ae5c74975f8986ae1123283df63cc4" />
                <Text fontSize="18px" fontWeight="bold">Vonga</Text>
            </HStack>
            <HStack>
                <Image width="64px" borderRadius="6px" src="https://i.scdn.co/image/ab67616d00001e02d3ee4bf67c2ac2154006ad72" />
                <Stack gap="0" fontFamily="arial, helvetica" lineHeight="18px">
                    <HStack gap="5px">
                        <Text>Call Me Maybe</Text>
                        {isExplicit && (
                            <MdExplicit />
                        )}
                    </HStack>
                    <Text>Carly Rae Jepsen</Text>
                </Stack>
            </HStack>
            <Box
                width="100%"
                height="8px"
                background="rgba(255, 255, 255, 0.25)"
                borderRadius="8px"
            >
                {/* Playback progress bar */}
                <Box
                    width="20%"
                    height="8px"
                    background="accent.dark"
                    borderRadius="8px"
                />
            </Box>
        </Stack>
    );
}