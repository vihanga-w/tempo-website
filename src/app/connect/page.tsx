"use client";

import { API_URL } from "@/lib/const";
import { Box, Button, Center, HStack, Input, Link, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

/**
 * Connecting another app (Lilt) to the person's Spotify through Tempo.
 *
 * Reached from that app with an OAuth request in the address
 * (client_id, redirect_uri, state, code_challenge). Tempo's server checks it
 * and does the rest (embedder/src/idp.ts); this page only asks.
 *
 * Three ways through:
 *  - signed in to Tempo here: agree, and go straight back;
 *  - a Spotify app set up before (for Tempo or for another app): its client ID;
 *  - neither: make a Spotify app (Spotify admits five people to any one app,
 *    so everyone past that needs their own), then its client ID and secret.
 *
 * Nobody arriving this way is put on Tempo: the account behind it has no
 * profile, friends or feed unless they sign up for Tempo itself.
 */

interface ConnectRequest { client_id: string; redirect_uri: string; state: string; code_challenge: string }

const ERRORS: Record<string, { title: string; body: string }> = {
    "user-management": {
        title: "Almost there: add yourself to your app",
        body: "Your app signed you in, then Spotify refused it, so the app works and your account is just not listed on it. On the Spotify dashboard open your app, then Settings › User Management, add your name and the email on your Spotify account, and try again.",
    },
    "tempo-full": {
        title: "You need a Spotify app of your own",
        body: "Tempo's shared app is full. Set up your own below: it takes about two minutes and only ever has to cover you.",
    },
    "not-your-app": {
        title: "That app belongs to another Spotify account",
        body: "A saved app can only sign in the account it was set up for. Use your own app's client ID, or set one up below.",
    },
    spotify: {
        title: "Spotify did not finish signing you in",
        body: "Try again. If it keeps happening, check the client ID and secret are from the same app.",
    },
};

export default function Connect() {
    const [request, setRequest] = useState<ConnectRequest | null>(null);
    const [appName, setAppName] = useState("");
    const [redirectUri, setRedirectUri] = useState("");
    const [invalid, setInvalid] = useState("");
    const [issue, setIssue] = useState("");
    const [signedIn, setSignedIn] = useState<string | null>(null);
    const [clientId, setClientId] = useState("");
    const [clientSecret, setClientSecret] = useState("");
    const [knownId, setKnownId] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const req: ConnectRequest = {
            client_id: q.get("client_id") ?? "",
            redirect_uri: q.get("redirect_uri") ?? "",
            state: q.get("state") ?? "",
            code_challenge: q.get("code_challenge") ?? "",
        };

        setIssue(q.get("error") ?? "");

        // Spotify sent the sign-in back to a browser that did not start it: a link someone
        // else made, or one copied between browsers. Nothing was connected.
        if (q.get("error") === "other-browser")
            return setInvalid("Connecting has to finish in the browser it started in, and nothing was connected. Go back to the app and connect again from there.");

        fetch(API_URL + "/idp/client?" + new URLSearchParams({ ...req }))
            .then(r => r.json())
            .then((r: { error: boolean; message?: string; name?: string; redirectUri?: string }) => {
                // The server's reason is for the app's developer; the person gets one plain line
                if (r.error || !r.name)
                    return setInvalid("It did not come from an app Tempo knows, or it was changed on the way.");

                setRequest(req);
                setAppName(r.name);
                setRedirectUri(r.redirectUri ?? "");
            })
            .catch(() => setInvalid("Could not reach Tempo. Try again in a moment."));

        fetch(API_URL + "/idp/session", { credentials: "include" })
            .then(r => r.json())
            .then((r: { signedIn: boolean; name: string | null }) => setSignedIn(r.signedIn ? (r.name ?? "") : null))
            .catch(() => setSignedIn(null));
    }, []);

    const go = async (path: string, body: Record<string, unknown>) => {
        setBusy(true);
        setError("");

        try {
            const r = await fetch(API_URL + path, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                // Never logged: the secret goes from this page to Tempo's server and nowhere else
                body: JSON.stringify(body),
            });
            const res = await r.json() as { error: boolean; message?: string; authUrl?: string; redirect?: string };
            const next = res.authUrl ?? res.redirect;

            if (!res.error && next) {
                window.location.href = next;

                return;
            }

            setError(res.message ?? "Something went wrong. Try again.");
        } catch {
            setError("Could not reach Tempo. Try again in a moment.");
        }

        setBusy(false);
    };

    const cancel = () => {
        if (!request)
            return;

        const url = new URL(request.redirect_uri);

        url.searchParams.set("error", "access_denied");
        url.searchParams.set("state", request.state);
        window.location.href = url.toString();
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(redirectUri);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { }
    };

    const field = (value: string, set: (v: string) => void, placeholder: string, secret = false) => (
        <Input
            value={value}
            onChange={e => set(e.target.value)}
            placeholder={placeholder}
            type={secret ? "password" : "text"}
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
    );

    const step = (n: number, title: string, body: React.ReactNode) => (
        <HStack align="flex-start" gap="14px">
            <Center minW="26px" w="26px" h="26px" borderRadius="full" bg="rgba(164,128,255,0.15)" border="1px solid rgba(164,128,255,0.35)" mt="1px">
                <Text fontSize="13px" fontWeight="semibold" fontFamily="Inter" color="#c4a8ff">{n}</Text>
            </Center>
            <Box flex="1" minW="0">
                <Text fontSize="15px" fontWeight="semibold" fontFamily="Inter" color="#f5f5f5" mb="1">{title}</Text>
                <Box fontSize="14px" fontFamily="Inter" color="#a0a0a0" lineHeight="1.6">{body}</Box>
            </Box>
        </HStack>
    );

    const card = { border: "1px solid #262626", borderRadius: "12px", p: "5", mb: "8", bg: "#131313" };
    const primary = { bg: "#c4a8ff", color: "#0d0d0d", fontFamily: "Inter", fontSize: "15px", borderRadius: "10px", _hover: { bg: "#d2bcff" } };
    const secondary = { bg: "#1f1f1f", color: "#f5f5f5", fontFamily: "Inter", fontSize: "14px", borderRadius: "10px", _hover: { bg: "#272727" } };
    const linkStyle = { color: "#c4a8ff", textDecoration: "underline" };
    const problem = ERRORS[issue];

    return (
        // The app shell stops <html> scrolling; a full page carries its own scroll container.
        <Box h="100dvh" w="100vw" overflowY="auto" bg="#0d0d0d">
            <Center minH="100%" px="6" py="12">
                <Box maxW="480px" w="100%">
                    {invalid ? (
                        <>
                            <Text fontSize="26px" fontWeight="bold" fontFamily="Inter" color="#f5f5f5" mb="3">This link does not work</Text>
                            <Text fontSize="15px" fontFamily="Inter" color="#a0a0a0" lineHeight="1.6">{invalid}{issue === "other-browser" ? "" : " Go back to the app and start again."}</Text>
                        </>
                    ) : !request ? (
                        <Text fontSize="15px" fontFamily="Inter" color="#a0a0a0">Loading…</Text>
                    ) : (
                        <>
                            <Text fontSize="26px" fontWeight="bold" fontFamily="Inter" color="#f5f5f5" mb="3">
                                Connect {appName} to your Spotify
                            </Text>
                            <Text fontSize="15px" fontFamily="Inter" color="#a0a0a0" mb="8" lineHeight="1.6">
                                {appName} will see what you are playing on Spotify: the song, how far in, and on which device.
                                Nothing else. You can disconnect it in {appName} at any time.
                            </Text>

                            {problem && (
                                <Box p="14px 16px" mb="7" borderRadius="12px" bg="rgba(164,128,255,0.10)" border="1px solid rgba(164,128,255,0.35)">
                                    <Text fontSize="14px" fontFamily="Inter" fontWeight="semibold" color="#f5f5f5" mb="1">{problem.title}</Text>
                                    <Text fontSize="13px" fontFamily="Inter" color="#bdbdbd" lineHeight="1.6">{problem.body}</Text>
                                </Box>
                            )}

                            {error && <Text fontSize="13px" fontFamily="Inter" color="#ff8a8a" mb="5" lineHeight="1.5">{error}</Text>}

                            {signedIn !== null && (
                                <Box {...card}>
                                    <Text fontSize="15px" fontWeight="semibold" fontFamily="Inter" color="#f5f5f5" mb="4">
                                        Signed in to Tempo as {signedIn}
                                    </Text>
                                    <Button w="100%" {...primary} isLoading={busy} onClick={() => go("/idp/authorize", { ...request })}>
                                        Allow {appName}
                                    </Button>
                                </Box>
                            )}

                            <Box {...card}>
                                <Text fontSize="15px" fontWeight="semibold" fontFamily="Inter" color="#f5f5f5" mb="2">Set up a Spotify app before?</Text>
                                <Text fontSize="14px" fontFamily="Inter" color="#a0a0a0" mb="4" lineHeight="1.6">
                                    If you made one for Tempo or another app connected through Tempo, its client ID is enough.
                                </Text>
                                <Stack gap="3">
                                    {field(knownId, setKnownId, "Client ID")}
                                    <Button {...secondary} isDisabled={!knownId.trim() || busy} isLoading={busy} onClick={() => go("/idp/spotify/start", { request, clientId: knownId.trim() })}>
                                        Continue with Spotify
                                    </Button>
                                </Stack>
                            </Box>

                            <Text fontSize="13px" fontFamily="Inter" color="#6b6b6b" mb="7" textAlign="center">or set one up, about two minutes</Text>

                            <Stack gap="22px" mb="8">
                                {step(1, "Create a Spotify app", (<>
                                    Sign in to <Link href="https://accounts.spotify.com/login" isExternal {...linkStyle}>Spotify</Link> with the account you play music on,
                                    then open <Link href="https://developer.spotify.com/dashboard/create" isExternal {...linkStyle}>Create app</Link>.
                                    Spotify needs that account to have Premium.
                                </>))}
                                {step(2, "Name it anything", `Only you see the name and description. "${appName}" is fine.`)}
                                {step(3, "Add this redirect URI", (<>
                                    <Text mb="2">Paste it exactly, then press Add.</Text>
                                    <HStack>
                                        <Box flex="1" minW="0" p="8px 10px" bg="#0d0d0d" border="1px solid #2a2a2a" borderRadius="8px" fontFamily="monospace" fontSize="12px" color="#f5f5f5" overflowX="auto" whiteSpace="nowrap">{redirectUri}</Box>
                                        <Button size="sm" {...secondary} onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
                                    </HStack>
                                </>))}
                                {step(4, "Tick Web API, then save", "Under \"Which API/SDKs are you planning to use?\" choose Web API, agree to Spotify's terms, and save.")}
                                {step(5, "Add yourself under User Management", "Still in Settings, open User Management and add your name and the email on your Spotify account. Spotify refuses everyone not listed, the app's owner included.")}
                                {step(6, "Copy your two codes", "On the app's Basic Information tab, copy the Client ID, then View client secret and copy that too.")}
                            </Stack>

                            <Stack gap="3" mb="8">
                                {field(clientId, setClientId, "Client ID")}
                                {field(clientSecret, setClientSecret, "Client secret", true)}
                                <Button {...primary} isDisabled={!clientId.trim() || !clientSecret.trim() || busy} isLoading={busy}
                                    onClick={() => go("/idp/spotify/start", { request, clientId: clientId.trim(), clientSecret: clientSecret.trim() })}>
                                    Continue with Spotify
                                </Button>
                            </Stack>

                            <Center>
                                <Button variant="link" fontFamily="Inter" fontSize="14px" color="#8a8a8a" onClick={cancel}>Cancel</Button>
                            </Center>
                        </>
                    )}
                </Box>
            </Center>
        </Box>
    );
}
