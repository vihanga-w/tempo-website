import { Box, Button, Center, Checkbox, Link, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { AppFormSession, startSpotifyAppForm } from "@/lib/native-spotify-app-form";
import { API_URL } from "@/lib/const";

/**
 * Setting up the Spotify connection an account needs.
 *
 * Spotify admits only a handful of listeners to each connection, so past that
 * everybody needs one of their own - which normally means filling in a
 * developer form most people have no reason to have seen. That is done here
 * instead, out of sight, and none of it is described in those terms: what is
 * being set up is their profile, and the machinery behind it is Tempo's problem
 * rather than theirs.
 *
 * The one thing that genuinely needs asking is the agreement, which is
 * reproduced word for word from Spotify's own form with its links intact.
 * Ticking a box on somebody's behalf is only defensible when they have agreed
 * to the same terms, so nothing is submitted until they have.
 */

const TERMS_URL = "https://developer.spotify.com/terms";
const DESIGN_URL = "https://developer.spotify.com/documentation/design";

/**
 * Tells the server why set-up stopped.
 *
 * All of this was already known here and warned to the console - but that
 * console is on the phone of the one person who cannot get in, so every failure
 * was diagnosed by guessing from server logs that had never seen it. Reported
 * so the reason lands beside the 403 that sent them to this screen.
 *
 * Deliberately unawaited and never throwing: somebody is already stuck, and a
 * failed report must not become the second thing that goes wrong in front of
 * them. The server takes only the fields below and bounds them all.
 */
function reportGaveUp(stage: "prepare" | "create" | "credentials", reason: string | undefined, extra?: {
    diagnostics?: Record<string, unknown>;
    message?: string;
}) {
    const diagnostics = extra?.diagnostics ?? {};

    void fetch(API_URL + "/diag/app-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            stage,
            reason: reason ?? "unknown",
            href: diagnostics.href,
            status: diagnostics.status,
            fields: diagnostics.fields,
            message: extra?.message,
        }),
    }).catch(() => { });
}

export function SpotifyAppSetup({ redirectUri, swapToken, onReady, onCancel }: {
    redirectUri: string;
    /** The sign-in session waiting on this, so the app is told when it finishes. */
    swapToken?: string;
    onReady: (authUrl: string) => void;
    onCancel: () => void;
}) {
    const [session, setSession] = useState<AppFormSession | undefined>();
    const [agreed, setAgreed] = useState(false);
    const [prepared, setPrepared] = useState(false);
    const [working, setWorking] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    /** Spotify will not let accounts without Premium set this up at all. */
    const [premiumRequired, setPremiumRequired] = useState(false);
    /**
     * Put off for now.
     *
     * Kept on this screen rather than handed back to the app: without this,
     * signing in is not possible at all, so unmounting left people on a loading
     * screen that would never finish.
     */
    const [declined, setDeclined] = useState(false);
    /**
     * Spotify said no, in its own words.
     *
     * Kept as a screen of its own rather than a line of red text under a form
     * they can no longer use: the usual reason is being asked to wait a day,
     * which is not something to fix by reading the form again.
     */
    const [refused, setRefused] = useState("");
    /** Bumped to start a fresh attempt after one was put off. */
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        // Prepared as this screen appears, so the time spent reading is the time
        // the set-up takes
        const started = startSpotifyAppForm({ redirectUri, hidden: true });

        setSession(started);

        started.ready.then((result) => {
            if (result.value) {
                setPrepared(true);

                return;
            }

            console.warn("Could not prepare the Spotify connection:", result.reason, result.diagnostics);

            reportGaveUp("prepare", result.reason, { diagnostics: result.diagnostics });

            if (result.reason === "premiumRequired") {
                started.close();

                setPremiumRequired(true);

                return;
            }

            setError(result.reason === "closed"
                ? "Set-up was closed before it finished."
                : result.reason === "stalled"
                    ? "Spotify stopped responding. Please check your connection and try again."
                    : "Could not reach Spotify. Please try again.");

            if (result.reason === "stalled")
                started.close();
        });

        return () => started.close();
    }, [redirectUri, attempt]);

    /**
     * Gives up, kindly.
     *
     * Closes the webview before saying anything: it is presented in a window
     * above the app, so a message raised while it is up appears behind it and
     * is never seen.
     */
    const giveUp = (message: string) => {
        session?.close();

        setWorking(false);
        setStatus("");
        setError(message);
    };

    const onContinue = async () => {
        // Both conditions checked here rather than trusted to the disabled
        // state: this is the point where an agreement is acted on
        if (!session || !agreed || !prepared || working)
            return;

        setWorking(true);
        setStatus("Setting up your profile…");
        setError("");

        const result = await session.create();

        if (!result.ok) {
            console.warn("Could not finish the Spotify connection:", result.status, result.message);

            reportGaveUp("create", result.status, { message: result.message });

            /*
             * Spotify's own words, when it gave any.
             *
             * It refuses for reasons only it knows - an account that already has
             * as many apps as it is allowed is the common one - and those reasons
             * are worth repeating rather than replacing with a guess. Anything
             * general enough to cover them all would tell somebody nothing about
             * the one thing standing in their way.
             */
            if (result.status === "refused" && result.message) {
                session.close();

                setWorking(false);
                setStatus("");
                setRefused(result.message);

                return;
            }

            giveUp(result.status === "stalled"
                ? "Spotify stopped responding while setting up your profile. Please check your connection and try again."
                : result.status === "noApp"
                    ? "Spotify did not finish setting up your profile, and did not say why. Please try again in a moment."
                    : "Spotify would not finish setting up your profile. Please try again in a moment.");

            return;
        }

        setStatus("Connecting to Spotify…");

        const creds = await session.credentials();

        if (!creds.clientId || !creds.clientSecret) {
            console.warn("Could not read the new connection's details:", creds.status, creds.diagnostics);

            reportGaveUp("credentials", creds.status, { diagnostics: creds.diagnostics });

            giveUp("Your profile was set up, but Tempo could not finish connecting it. Please try again in a moment.");

            return;
        }

        try {
            const req = await fetch(API_URL + "/spotify/byo/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                // Never logged: these belong to the person, and go from the page
                // to the server and nowhere else
                body: JSON.stringify({
                    clientId: creds.clientId,
                    clientSecret: creds.clientSecret,
                    ...(swapToken ? { swapToken } : {}),
                }),
            });

            const res = await req.json() as { error: boolean; message?: string; authUrl?: string };

            if (!res.error && res.authUrl) {
                setStatus("Almost there…");

                // Sent to the webview that did the set-up, which is the one
                // signed in to Spotify and the one the app is waiting on
                session.continueTo(res.authUrl);

                onReady(res.authUrl);

                return;
            }

            console.warn("Tempo would not accept the new connection:", res.message);
        } catch (ex) {
            console.warn("Could not connect the new profile:", ex);
        }

        giveUp("Your profile was set up, but Tempo could not finish connecting it. Please try again in a moment.");
    };

    return (
        <Center background="#0D0D0E" pos="fixed" top="0" left="0" width="100vw" height="100vh" padding="24px" zIndex="10000">
            <Stack gap="22px" maxWidth="440px" width="100%">
                <Text fontFamily="Inter" fontSize="26px" fontWeight="bold">
                    {premiumRequired
                        ? "Spotify Premium required"
                        : refused !== ""
                            ? "Spotify needs a moment"
                            : declined
                                ? "Whenever you're ready"
                                : "Setting up your profile"}
                </Text>

                {premiumRequired && (
                    <Stack gap="18px">
                        <Text fontFamily="Inter" fontSize="15px" lineHeight="1.5" opacity="0.75">
                            Spotify only lets Premium accounts set this up, so Tempo cannot connect
                            to a free account. If you upgrade, come back and Tempo will pick up
                            from here.
                        </Text>
                        <Button onClick={() => { setPremiumRequired(false); setAttempt((a) => a + 1); }}>
                            I&apos;ve upgraded — try again
                        </Button>
                    </Stack>
                )}

                {refused !== "" && (
                    <Stack gap="18px">
                        <Text fontFamily="Inter" fontSize="15px" lineHeight="1.5" opacity="0.75">
                            Spotify would not set your profile up just now, and said:
                        </Text>
                        <Text fontFamily="Inter" fontSize="15px" lineHeight="1.5" background="rgba(255,255,255,0.05)" borderRadius="12px" padding="14px">
                            {refused}
                        </Text>
                        <Text fontFamily="Inter" fontSize="14px" lineHeight="1.5" opacity="0.6">
                            Nothing is lost — come back when it will let you, and Tempo will
                            pick up from here.
                        </Text>
                        <Button onClick={() => { setRefused(""); setError(""); setAttempt((a) => a + 1); }}>
                            Try again
                        </Button>
                    </Stack>
                )}

                {declined && (
                    <Stack gap="18px">
                        <Text fontFamily="Inter" fontSize="15px" lineHeight="1.5" opacity="0.75">
                            No problem. Tempo needs this one-off step before it can follow your
                            listening, so there is not much to see until it is done — it only
                            takes a moment whenever you are ready.
                        </Text>
                        <Button onClick={() => { setDeclined(false); setError(""); setAttempt((a) => a + 1); }}>
                            Set up my profile
                        </Button>
                    </Stack>
                )}

                {!premiumRequired && !declined && refused === "" && (<>
                    <Text fontFamily="Inter" fontSize="15px" lineHeight="1.5" opacity="0.75">
                        Spotify lets only a handful of listeners share a connection, so Tempo
                        gives you one of your own. We configure it for you — all you need to do
                        is agree to Spotify&apos;s terms.
                    </Text>

                    <Box background="rgba(255,255,255,0.05)" borderRadius="12px" padding="16px">
                        <Checkbox
                            isChecked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                            alignItems="flex-start"
                        >
                            <Text fontFamily="Inter" fontSize="14px" lineHeight="1.5">
                                I understand and agree with Spotify&apos;s{" "}
                                <Link href={TERMS_URL} isExternal textDecoration="underline">Developer Terms of Service</Link>
                                {" "}and{" "}
                                <Link href={DESIGN_URL} isExternal textDecoration="underline">Design Guidelines</Link>.
                            </Text>
                        </Checkbox>
                    </Box>

                    {error !== "" && (
                        <Text fontFamily="Inter" fontSize="13px" color="#ff8a8a">{error}</Text>
                    )}

                    <Button
                        onClick={onContinue}
                        isDisabled={!agreed || !prepared || working}
                        isLoading={working}
                        loadingText={status !== "" ? status : "Setting up your profile…"}
                    >
                        {prepared ? "Continue" : "Getting ready…"}
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        isDisabled={working}
                        onClick={() => {
                            session?.close();

                            setDeclined(true);
                        }}
                    >
                        Not now
                    </Button>
                </>)}
            </Stack>
        </Center>
    );
}
