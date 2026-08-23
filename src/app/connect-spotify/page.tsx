"use client";

import { API_URL } from "@/lib/const";
import { Box, Button, Center, HStack, Input, Link, Stack, Text, useToast } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { DefaultSystemBrowserOptions, InAppBrowser } from "@capacitor/inappbrowser";

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
/** Where a half finished client ID waits while the user is on the dashboard. */
const CLIENT_ID_DRAFT_KEY = "tempo-byo-client-id-draft";

export default function ConnectSpotify() {
    const [redirectUri, setRedirectUri] = useState<string>("");
    const [dashboardUrl, setDashboardUrl] = useState<string>("https://developer.spotify.com/dashboard");
    const [clientId, setClientId] = useState<string>("");
    const [clientSecret, setClientSecret] = useState<string>("");
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [identifier, setIdentifier] = useState<string>("");
    const [resuming, setResuming] = useState<boolean>(false);
    const [resumeError, setResumeError] = useState<string>("");

    const toast = useToast();

    /**
     * Sends a link to the browser instead of following it in place.
     *
     * This page is the one place someone has to fetch two values from another
     * site and bring them back. Following a link in place means leaving the
     * page, and returning to it means an empty form and a second trip for the
     * value they had already copied — twice over, since the ID and the secret
     * are revealed separately. Somewhere they can switch away from and back to
     * keeps the form exactly where they left it.
     *
     * On the web the anchor is left to do it. iOS only honours a window it was
     * asked to open synchronously from the gesture that asked for it, so
     * anything scripted behind an await is dropped without a word — and letting
     * the browser follow the href sidesteps that entirely, while keeping
     * long-press and open-in-new-tab working. Only a native build intercepts,
     * because a Capacitor webview has no browser tab to hand off to.
     */
    const handleExternalLink = (url: string) => (event: { preventDefault: () => void }) => {
        if (!Capacitor.isNativePlatform())
            return;

        event.preventDefault();

        InAppBrowser.openInSystemBrowser({ url, options: DefaultSystemBrowserOptions })
            .catch(e => console.warn("Could not open the system browser:", e));
    };

    /**
     * Keeps the client ID across a trip to the dashboard.
     *
     * A belt-and-braces measure for the case where the link opens in place after
     * all. The secret is deliberately not kept: it is the more sensitive of the
     * two and it is copied last, so the trip that would lose it is the one the
     * user is already on their way back from.
     */
    useEffect(() => {
        const saved = window.localStorage.getItem(CLIENT_ID_DRAFT_KEY);

        if (saved)
            setClientId(saved);
    }, []);

    useEffect(() => {
        if (clientId.trim() === "")
            window.localStorage.removeItem(CLIENT_ID_DRAFT_KEY);
        else
            window.localStorage.setItem(CLIENT_ID_DRAFT_KEY, clientId.trim());
    }, [clientId]);

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

    /**
     * Sends a returning user back to the Spotify app they already set up.
     *
     * Reinstalling wipes any record of which app this account used, so signing
     * in reaches for Tempo's, Spotify refuses an account that is not on its
     * development allowlist, and they land back here. The server still holds
     * their app's credentials — it only needs to be told which account to look
     * them up under, and nothing has to be entered a second time.
     */
    const resume = async () => {
        setResumeError("");
        setResuming(true);

        try {
            const req = await fetch(API_URL + "/auth/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ identifier: identifier.trim() }),
            });

            const res = await req.json() as { error: boolean; message?: string; url?: string; matched?: boolean };

            if (res.error || !res.url) {
                setResumeError(res.message ?? "Something went wrong. Please try again.");
                setResuming(false);

                return;
            }

            // Without an app of their own on file, following the URL would hand
            // them the same refusal that sent them here. Say so instead.
            if (!res.matched) {
                setResumeError("We don't have a Spotify app saved for that username. Set one up below — it only takes a couple of minutes.");
                setResuming(false);

                return;
            }

            window.location.href = res.url;
        } catch {
            setResumeError("Couldn't reach Tempo. Check your connection and try again.");
            setResuming(false);
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

            try { window.localStorage.removeItem(CLIENT_ID_DRAFT_KEY); } catch { }

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

                <Box
                    border="1px solid #262626"
                    borderRadius="12px"
                    p="5"
                    mb="8"
                    bg="#131313"
                >
                    <Text fontSize="15px" fontWeight="semibold" fontFamily="Inter" color="#f5f5f5" mb="2">
                        Done this before?
                    </Text>

                    <Text fontSize="14px" fontFamily="Inter" color="#a0a0a0" mb="4" lineHeight="1.6">
                        If you&apos;ve already connected your own Spotify app to Tempo, it&apos;s still
                        saved. Tell us your Spotify username and we&apos;ll take you straight
                        there — nothing to set up again.
                    </Text>

                    <Stack gap="3">
                        <Input
                            value={identifier}
                            onChange={e => setIdentifier(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === "Enter" && identifier.trim() !== "" && !resuming)
                                    resume();
                            }}
                            placeholder="Spotify username or profile link"
                            bg="#0d0d0d"
                            border="1px solid #2a2a2a"
                            borderRadius="10px"
                            color="#f5f5f5"
                            fontFamily="Inter"
                            fontSize="14px"
                            _placeholder={{ color: "#5a5a5a" }}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                        />

                        {resumeError !== "" && (
                            <Text fontSize="13px" fontFamily="Inter" color="#ff8a8a" lineHeight="1.5">
                                {resumeError}
                            </Text>
                        )}

                        <Button
                            onClick={resume}
                            isDisabled={identifier.trim() === "" || resuming}
                            isLoading={resuming}
                            bg="#1f1f1f"
                            color="#f5f5f5"
                            fontFamily="Inter"
                            fontSize="14px"
                            borderRadius="10px"
                            _hover={{ bg: "#272727" }}
                            _active={{ bg: "#2f2f2f" }}
                        >
                            Continue
                        </Button>
                    </Stack>

                    <Text fontSize="12px" fontFamily="Inter" color="#6b6b6b" mt="3" lineHeight="1.5">
                        Your username is on Spotify under Account &rsaquo; Account details, or
                        paste a link to your profile.
                    </Text>
                </Box>

                <Text fontSize="13px" fontFamily="Inter" color="#6b6b6b" mb="7" textAlign="center">
                    or set one up for the first time
                </Text>

                <Stack gap="22px" mb="9">
                    {step(1, "Open the Spotify dashboard", (<>
                        <Text mb="2">
                            Sign in to{" "}
                            <Link
                                href="https://accounts.spotify.com/login"
                                isExternal
                                onClick={handleExternalLink("https://accounts.spotify.com/login")}
                                color="#c4a8ff"
                                textDecoration="underline"
                            >
                                Spotify
                            </Link>{" "}
                            first, with the same account you use for music. Then open{" "}
                            <Link
                                href={dashboardUrl}
                                isExternal
                                onClick={handleExternalLink(dashboardUrl)}
                                color="#c4a8ff"
                                textDecoration="underline"
                            >
                                developer.spotify.com/dashboard
                            </Link>{" "}
                            and choose <b>Create app</b>. Both open in your browser, so
                            you can switch back here with what you copied.
                        </Text>

                        {/*
                          * The dashboard does not send a signed-out visitor to a login
                          * page. It shows a generic failure that suggests trying again
                          * later, which reads as Spotify being down rather than as
                          * needing to sign in — so signing in is given as the first
                          * step rather than something to work out after it goes wrong.
                          */}
                        <Text fontSize="13px" color="#8a8a8a" lineHeight="1.5">
                            If the dashboard says something went wrong and to try again
                            later, that usually means you&apos;re signed out — it doesn&apos;t
                            offer a login page. Sign in above and reload it.
                        </Text>
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
