"use client";

import { API_URL } from "@/lib/const";
import { Box, Button, Center, HStack, Input, Link, Stack, Text, useToast } from "@chakra-ui/react";
import { useEffect, useState } from "react";

/**
 * Sets an account up against its own Spotify app.
 *
 * Spotify's development mode only admits a handful of named accounts to an app,
 * and Tempo's is full. Rather than turning people away, this walks them through
 * creating an app of their own — which has its own allowance, and only ever
 * needs to hold them.
 *
 * The redirect URI is read from the API rather than written here, because it is
 * the one value that must match the deployment exactly and is the usual reason
 * a set-up fails.
 */
export default function ConnectSpotify() {
    const [redirectUri, setRedirectUri] = useState<string>("");
    const [dashboardUrl, setDashboardUrl] = useState<string>("https://developer.spotify.com/dashboard");
    const [clientId, setClientId] = useState<string>("");
    const [clientSecret, setClientSecret] = useState<string>("");
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string>("");

    const toast = useToast();

    useEffect(() => {
        fetch(API_URL + "/spotify/byo/info")
            .then(r => r.json())
            .then((d: { redirectUri?: string; dashboardUrl?: string }) => {
                if (d.redirectUri)
                    setRedirectUri(d.redirectUri);

                if (d.dashboardUrl)
                    setDashboardUrl(d.dashboardUrl);
            })
            .catch(() => setRedirectUri(""));
    }, []);

    const copyRedirect = async () => {
        try {
            await navigator.clipboard.writeText(redirectUri);
            toast({ title: "Redirect URI copied", status: "success", duration: 2000, position: "top" });
        } catch {
            toast({ title: "Couldn't copy — select it and copy manually", status: "error", duration: 3000, position: "top" });
        }
    };

    const submit = async () => {
        setError("");
        setSubmitting(true);

        try {
            const req = await fetch(API_URL + "/spotify/byo/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
            });

            const res = await req.json() as { error: boolean; message?: string; authUrl?: string };

            if (res.error || !res.authUrl) {
                setError(res.message ?? "Something went wrong. Please try again.");
                setSubmitting(false);

                return;
            }

            // Straight into Spotify's consent screen, now under their own app
            window.location.href = res.authUrl;
        } catch {
            setError("Couldn't reach Tempo. Check your connection and try again.");
            setSubmitting(false);
        }
    };

    const ready = /^[a-f0-9]{32}$/i.test(clientId.trim()) && /^[a-f0-9]{32}$/i.test(clientSecret.trim());

    const step = (n: number, title: string, body: React.ReactNode) => (
        <HStack align="flex-start" gap="14px">
            <Center
                minW="26px"
                w="26px"
                h="26px"
                borderRadius="full"
                bg="rgba(164,128,255,0.15)"
                border="1px solid rgba(164,128,255,0.35)"
                mt="1px"
            >
                <Text fontSize="13px" fontWeight="semibold" fontFamily="Inter" color="#c4a8ff">{n}</Text>
            </Center>

            <Box flex="1" minW="0">
                <Text fontSize="15px" fontWeight="semibold" fontFamily="Inter" color="#f5f5f5" mb="1">{title}</Text>
                <Box fontSize="14px" fontFamily="Inter" color="#a0a0a0" lineHeight="1.6">{body}</Box>
            </Box>
        </HStack>
    );

    return (
        // The app shell sets `overflow: hidden` on <html> so it can manage its
        // own scrolling, which leaves a full-page route unable to scroll at all.
        // This content is taller than a phone viewport, so it has to carry its
        // own scroll container or the fields at the bottom cannot be reached.
        <Box h="100dvh" w="100vw" overflowY="auto" bg="#0d0d0d">
            <Center minH="100%" px="6" py="12">
                <Box maxW="480px" w="100%">
                <Text fontSize="26px" fontWeight="bold" fontFamily="Inter" color="#f5f5f5" mb="3">
                    One quick setup step
                </Text>

                <Text fontSize="15px" fontFamily="Inter" color="#a0a0a0" mb="9" lineHeight="1.6">
                    Spotify only lets a small, fixed number of accounts use any one app,
                    and Tempo&apos;s is full. Creating your own takes about two minutes and
                    it only ever has to cover you.
                </Text>

                <Stack gap="22px" mb="9">
                    {step(1, "Open the Spotify dashboard", (<>
                        Go to{" "}
                        <Link href={dashboardUrl} isExternal color="#c4a8ff" textDecoration="underline">
                            developer.spotify.com/dashboard
                        </Link>{" "}
                        and sign in with the same Spotify account you use for music. Then
                        choose <b>Create app</b>.
                    </>))}

                    {step(2, "Name it anything", "The name and description are only ever seen by you. \"Tempo\" is fine.")}

                    {step(3, "Add this redirect URI", (<>
                        <Text mb="2">
                            Paste this into <b>Redirect URIs</b> exactly as it appears, then
                            press Add. Getting this wrong is the one thing that will stop
                            sign-in working.
                        </Text>

                        <HStack
                            gap="8px"
                            p="10px 12px"
                            borderRadius="10px"
                            bg="#161616"
                            border="1px solid #262626"
                            align="center"
                        >
                            <Text
                                flex="1"
                                minW="0"
                                fontSize="13px"
                                fontFamily="monospace"
                                color="#f5f5f5"
                                overflowX="auto"
                                whiteSpace="nowrap"
                            >{redirectUri || "Loading…"}</Text>

                            <Button
                                size="xs"
                                h="28px"
                                px="10px"
                                borderRadius="7px"
                                bg="#262626"
                                color="#f5f5f5"
                                fontFamily="Inter"
                                _hover={{ bg: "#333" }}
                                isDisabled={!redirectUri}
                                onClick={copyRedirect}
                            >Copy</Button>
                        </HStack>
                    </>))}

                    {step(4, "Tick Web API, then save", "Under \"Which API/SDKs are you planning to use?\" select Web API and agree to the terms.")}

                    {step(5, "Copy your two codes", "Open the app's Settings. Copy the Client ID, then View client secret and copy that too.")}
                </Stack>

                <Stack gap="10px" mb="5">
                    <Input
                        placeholder="Client ID"
                        value={clientId}
                        onChange={e => setClientId(e.target.value)}
                        h="48px"
                        bg="#161616"
                        border="1px solid #262626"
                        borderRadius="10px"
                        fontFamily="Inter"
                        color="#f5f5f5"
                        _placeholder={{ color: "#6b6b6b" }}
                        _hover={{ borderColor: "#333" }}
                        _focusVisible={{ borderColor: "#a480ff", boxShadow: "none" }}
                    />

                    <Input
                        placeholder="Client secret"
                        type="password"
                        value={clientSecret}
                        onChange={e => setClientSecret(e.target.value)}
                        h="48px"
                        bg="#161616"
                        border="1px solid #262626"
                        borderRadius="10px"
                        fontFamily="Inter"
                        color="#f5f5f5"
                        _placeholder={{ color: "#6b6b6b" }}
                        _hover={{ borderColor: "#333" }}
                        _focusVisible={{ borderColor: "#a480ff", boxShadow: "none" }}
                    />
                </Stack>

                {error !== "" && (
                    <Text fontSize="14px" fontFamily="Inter" color="#ff8a8a" mb="4" lineHeight="1.5">
                        {error}
                    </Text>
                )}

                <Button
                    w="100%"
                    h="52px"
                    borderRadius="full"
                    bg="#f5f5f5"
                    color="#0d0d0d"
                    fontFamily="Inter"
                    fontWeight="semibold"
                    _hover={{ bg: "#e0e0e0" }}
                    isDisabled={!ready}
                    isLoading={submitting}
                    loadingText="Checking with Spotify"
                    onClick={submit}
                >
                    Continue to Spotify
                </Button>

                <Text fontSize="13px" fontFamily="Inter" color="#6b6b6b" mt="6" lineHeight="1.6">
                    Your secret is stored so Tempo can keep your listening activity up to
                    date, and is never shown to anyone else.
                </Text>
                </Box>
            </Center>
        </Box>
    );
}
