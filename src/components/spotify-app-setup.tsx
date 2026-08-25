import { Box, Button, Center, Checkbox, Link, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { AppFormSession, startSpotifyAppForm } from "@/lib/native-spotify-app-form";
import { API_URL } from "@/lib/const";

/**
 * Setting up the Spotify app an account needs, without the dashboard.
 *
 * Spotify's development mode admits only a handful of accounts per app, so
 * everyone past that has to sign in against an app of their own - which means
 * filling in a developer form most people have no reason to have seen. The form
 * is filled here instead, out of sight, while this screen asks the one thing
 * that genuinely needs asking.
 *
 * That one thing is the agreement. It is reproduced word for word from
 * Spotify's own form, with its links intact, because ticking a box on somebody's
 * behalf is only defensible when they have actually agreed to the same terms.
 * Nothing is submitted until they have, and Continue stays disabled until then.
 */

/** Spotify's own wording on the create-app form, reproduced exactly. */
const TERMS_LABEL = "I understand and agree with Spotify's Developer Terms of Service and Design Guidelines.";
/**
 * Whether to enrol the new app with Tempo as soon as it is created.
 *
 * Off while the set-up flow is being worked on: creating the app and reading
 * its credentials is the part being got right, and signing in on the back of it
 * would move the screen on before that can be seen.
 */
const ENROL_AFTER_CREATE = false;

const TERMS_URL = "https://developer.spotify.com/terms";
const DESIGN_URL = "https://developer.spotify.com/documentation/design";

export function SpotifyAppSetup({ redirectUri, onCreated, onCancel }: {
    redirectUri: string;
    onCreated: (authUrl?: string) => void;
    onCancel: () => void;
}) {
    const [session, setSession] = useState<AppFormSession | undefined>();
    const [agreed, setAgreed] = useState(false);
    const [prepared, setPrepared] = useState(false);
    const [working, setWorking] = useState(false);
    const [status, setStatus] = useState("");
    /** Temporary: the credentials just read, for checking against the dashboard. */
    const [captured, setCaptured] = useState<{ clientId: string; clientSecret: string } | undefined>();
    /** Spotify will not let accounts without Premium create an app at all. */
    const [premiumRequired, setPremiumRequired] = useState(false);
    /**
     * Put off for now.
     *
     * Kept on this screen rather than handed back to the app: an account with
     * no Spotify app of its own cannot sign in at all, so unmounting left
     * people on a loading screen that would never finish. Saying so, with a way
     * back, is the honest version of the same answer.
     */
    const [declined, setDeclined] = useState(false);
    /** Bumped to start a fresh attempt after one was put off. */
    const [attempt, setAttempt] = useState(0);
    const [error, setError] = useState("");

    useEffect(() => {
        // Prepared as soon as this screen appears, so the time spent reading is
        // the time the form takes to fill
        const started = startSpotifyAppForm({ redirectUri, hidden: true });

        setSession(started);

        started.ready.then((result) => {
            if (result.value) {
                setPrepared(true);

                return;
            }

            console.warn("Could not prepare the Spotify app form:", result.reason, result.diagnostics);

            /*
             * Spotify locks the Web API choice for accounts without Premium, so
             * there is no app to be made here and nothing to be gained by
             * leaving the form up. Closed rather than hidden - this flow is over.
             */
            if (result.reason === "premiumRequired") {
                started.close();

                setPremiumRequired(true);

                return;
            }

            setError(result.reason === "closed"
                ? "Set-up was closed before it finished."
                : result.reason === "stalled"
                    ? "Spotify stopped responding. Please check your connection and try again."
                    : "Could not reach Spotify's app form. Please try again.");

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
     * is never seen - which is exactly how a hidden failure stays hidden.
     */
    const giveUp = (message: string) => {
        session?.close();

        setWorking(false);
        setStatus("");
        setError(message);

        alert(message);
    };

    const onContinue = async () => {
        // Both conditions, checked here rather than trusted to the disabled
        // state: this is the point where an agreement is acted on
        if (!session || !agreed || !prepared || working)
            return;

        setWorking(true);
        setError("");

        console.log("[setup] creating…");

        const result = await session.create();

        console.log("[setup] create returned", result.ok, result.status);

        if (result.ok) {
            /*
             * Straight on to enrolling with it. The app exists at this point,
             * and the credentials are on the page Spotify just landed on, so
             * asking the person to copy two 32-character codes would be asking
             * them to do the one job this whole screen exists to remove.
             */
            const creds = await session.credentials();

            // Says whether each was found, never what they are
            console.log("[setup] credentials returned", creds.status, "id:", !!creds.clientId, "secret:", !!creds.clientSecret);

            if (creds.clientId && creds.clientSecret) {
                /*
                 * Shown on this screen rather than in an alert: the webview is
                 * presented in a window of its own above the app, so an alert
                 * raised from here appears behind it and is never seen.
                 *
                 * Temporary, to confirm both are read correctly.
                 */
                session.conceal();

                setCaptured({ clientId: creds.clientId, clientSecret: creds.clientSecret });

                if (!ENROL_AFTER_CREATE) {
                    setWorking(false);
                    setStatus("");

                    // Left on screen so the app that was just made can be
                    // looked over
                    session.reveal();

                    return;
                }

                setStatus("Connecting your app to Tempo…");

                try {
                    const req = await fetch(API_URL + "/spotify/byo/start", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        // Never logged: this is the person's app secret, and it
                        // goes from the page to the server and nowhere else
                        body: JSON.stringify({ clientId: creds.clientId, clientSecret: creds.clientSecret }),
                    });

                    const res = await req.json() as { error: boolean; message?: string; authUrl?: string };

                    if (!res.error && res.authUrl) {
                        onCreated(res.authUrl);

                        return;
                    }

                    console.warn("Tempo would not accept the new app:", res.message);
                } catch (ex) {
                    console.warn("Could not enrol the new app:", ex);
                }
            } else {
                console.warn("Could not read the new app's credentials:", creds.status, creds.diagnostics);

                giveUp("Your Spotify app was created, but Tempo could not read its details. You can finish connecting it from Spotify's dashboard.");

                return;
            }

            giveUp("Your Spotify app was created, but Tempo could not connect it. Please try again in a moment.");

            return;
        }

        console.warn("Could not create the Spotify app:", result.status);

        giveUp(result.status === "stalled"
            ? "Spotify stopped responding while setting your app up. Please check your connection and try again."
            : "Spotify would not accept the set-up form. Please try again in a moment.");
    };

    return (
        <Center background="#0D0D0E" pos="fixed" top="0" left="0" width="100vw" height="100vh" padding="24px" zIndex="10000">
            <Stack gap="22px" maxWidth="440px" width="100%">
                <Text fontFamily="Inter" fontSize="26px" fontWeight="bold">
                    {premiumRequired
                        ? "Spotify Premium required"
                        : declined
                            ? "Whenever you're ready"
                            : captured
                                ? "Your app is ready"
                                : "One quick set-up step"}
                </Text>

                {premiumRequired && (
                    <Stack gap="18px">
                        <Text fontFamily="Inter" fontSize="15px" lineHeight="1.5" opacity="0.75">
                            Spotify only lets Premium accounts create the kind of app Tempo needs,
                            so this cannot be set up on a free account. If you upgrade, come back
                            and Tempo will pick up from here.
                        </Text>
                        <Button onClick={() => { setPremiumRequired(false); setAttempt((a) => a + 1); }}>
                            I&apos;ve upgraded — try again
                        </Button>
                    </Stack>
                )}

                {declined && (
                    <Stack gap="18px">
                        <Text fontFamily="Inter" fontSize="15px" lineHeight="1.5" opacity="0.75">
                            No problem. Tempo needs this one-off set-up before it can read your
                            listening, so there is not much to see until it is done — it only takes
                            a moment whenever you are ready.
                        </Text>
                        <Button onClick={() => { setDeclined(false); setError(""); setAttempt((a) => a + 1); }}>
                            Set it up now
                        </Button>
                    </Stack>
                )}

                {captured && (
                    <Stack gap="12px">
                        <Text fontFamily="Inter" fontSize="13px" opacity="0.6">Client ID</Text>
                        <Text fontFamily="monospace" fontSize="13px" wordBreak="break-all">{captured.clientId}</Text>
                        <Text fontFamily="Inter" fontSize="13px" opacity="0.6">Client secret</Text>
                        <Text fontFamily="monospace" fontSize="13px" wordBreak="break-all">{captured.clientSecret}</Text>
                        <Button size="sm" variant="outline" onClick={() => session?.reveal()}>Show the Spotify page</Button>
                    </Stack>
                )}

                {!captured && !premiumRequired && !declined && (<Text fontFamily="Inter" fontSize="15px" lineHeight="1.5" opacity="0.75">
                    Spotify only lets a handful of people use each app, so Tempo sets up one
                    that belongs to you. We fill in the details for you — you just need to
                    agree to Spotify&apos;s terms below.
                </Text>)}

                {!captured && !premiumRequired && !declined && (<Box background="rgba(255,255,255,0.05)" borderRadius="12px" padding="16px">
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
                </Box>)}

                {error !== "" && (
                    <Text fontFamily="Inter" fontSize="13px" color="#ff8a8a">{error}</Text>
                )}

                {!captured && !premiumRequired && !declined && (<Button
                    onClick={onContinue}
                    isDisabled={!agreed || !prepared || working}
                    isLoading={working}
                    loadingText={status !== "" ? status : "Creating your app"}
                >
                    {prepared ? "Continue" : "Preparing…"}
                </Button>)}

                {!captured && !premiumRequired && !declined && (
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
                )}
            </Stack>
        </Center>
    );
}

/** The wording this screen must keep in step with, exported for tests. */
export const SPOTIFY_TERMS_LABEL = TERMS_LABEL;
