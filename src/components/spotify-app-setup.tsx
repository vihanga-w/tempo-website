import { Box, Button, Center, Checkbox, Link, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { AppFormSession, startSpotifyAppForm } from "@/lib/native-spotify-app-form";

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
const TERMS_URL = "https://developer.spotify.com/terms";
const DESIGN_URL = "https://developer.spotify.com/documentation/design";

export function SpotifyAppSetup({ redirectUri, onCreated, onCancel }: {
    redirectUri: string;
    onCreated: () => void;
    onCancel: () => void;
}) {
    const [session, setSession] = useState<AppFormSession | undefined>();
    const [agreed, setAgreed] = useState(false);
    const [prepared, setPrepared] = useState(false);
    const [working, setWorking] = useState(false);
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

            setError(result.reason === "closed"
                ? "Set-up was closed before it finished."
                : "Could not reach Spotify's app form. Please try again.");
        });

        return () => started.close();
    }, [redirectUri]);

    const onContinue = async () => {
        // Both conditions, checked here rather than trusted to the disabled
        // state: this is the point where an agreement is acted on
        if (!session || !agreed || !prepared || working)
            return;

        setWorking(true);
        setError("");

        const result = await session.create();

        if (result.ok) {
            onCreated();

            return;
        }

        console.warn("Could not create the Spotify app:", result.status);

        setWorking(false);
        setError("Spotify would not accept the form. It is on screen now if you would like to finish it there.");

        session.reveal();
    };

    return (
        <Center background="#0D0D0E" pos="fixed" top="0" left="0" width="100vw" height="100vh" padding="24px" zIndex="10000">
            <Stack gap="22px" maxWidth="440px" width="100%">
                <Text fontFamily="Inter" fontSize="26px" fontWeight="bold">One quick set-up step</Text>

                <Text fontFamily="Inter" fontSize="15px" lineHeight="1.5" opacity="0.75">
                    Spotify only lets a handful of people use each app, so Tempo sets up one
                    that belongs to you. We fill in the details for you — you just need to
                    agree to Spotify&apos;s terms below.
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
                    loadingText="Creating your app"
                >
                    {prepared ? "Continue" : "Preparing…"}
                </Button>

                <Button variant="ghost" size="sm" onClick={onCancel} isDisabled={working}>
                    Not now
                </Button>
            </Stack>
        </Center>
    );
}

/** The wording this screen must keep in step with, exported for tests. */
export const SPOTIFY_TERMS_LABEL = TERMS_LABEL;
