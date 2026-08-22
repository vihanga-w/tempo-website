"use client";

import { Box, Button, Center, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";

/**
 * Shown when authentication could not be completed.
 *
 * Both this route and /static-error were linked from the API and from the
 * success page but never actually existed, so every failure path ended on a 404
 * with no way back.
 */
export default function AuthError() {
    const router = useRouter();

    return (
        <Center h="100vh" w="100vw" px="8" bg="#0d0d0d">
            <Box maxW="420px" textAlign="center">
                <Text fontSize="28px" fontWeight="bold" fontFamily="Inter" color="#f5f5f5" mb="3">
                    We couldn&apos;t sign you in
                </Text>

                <Text fontSize="16px" fontFamily="Inter" color="#a0a0a0" mb="8" lineHeight="1.6">
                    Your session didn&apos;t complete. This is usually temporary —
                    signing in again should sort it.
                </Text>

                <Button
                    w="100%"
                    h="52px"
                    borderRadius="full"
                    bg="#f5f5f5"
                    color="#0d0d0d"
                    fontFamily="Inter"
                    _hover={{ bg: "#e0e0e0" }}
                    onClick={() => router.push("/")}
                >
                    Try again
                </Button>

                <Text fontSize="13px" fontFamily="Inter" color="#6b6b6b" mt="6">
                    Still stuck? Reach us at hello@tempo-music.co
                </Text>
            </Box>
        </Center>
    );
}
