"use client";

import { Box, Center, Text } from "@chakra-ui/react";

/**
 * Failure page for flows that finish outside the app, such as the Spotify
 * callback landing in a browser tab rather than the installed app. Deliberately
 * has no "try again" control, since there is nothing here to return to.
 */
export default function StaticAuthError() {
    return (
        <Center h="100vh" w="100vw" px="8" bg="#0d0d0d">
            <Box maxW="420px" textAlign="center">
                <Text fontSize="28px" fontWeight="bold" fontFamily="Inter" color="#f5f5f5" mb="3">
                    Something went wrong
                </Text>

                <Text fontSize="16px" fontFamily="Inter" color="#a0a0a0" lineHeight="1.6">
                    We couldn&apos;t finish connecting your Spotify account. Close
                    this tab and try again from the Tempo app.
                </Text>

                <Text fontSize="13px" fontFamily="Inter" color="#6b6b6b" mt="6">
                    Still stuck? Reach us at hello@tempo-music.co
                </Text>
            </Box>
        </Center>
    );
}
