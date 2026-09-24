import { Button, Divider, Heading, HStack, Text, VStack } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SiApplemusic } from "react-icons/si";

import {
    canLinkAppleMusicHere,
    getLinkedAccounts,
    linkAppleMusic,
    linkedHere,
    LinkedAccountsStatus,
    prepareAppleMusicLink,
    unlinkAppleMusic,
} from "@/lib/apple-music";

/**
 * Linking Apple Music, beside Spotify.
 *
 * Both can be linked at once, and Tempo keeps listening on both: what is
 * played on either lands in the same history. Nothing here while the server
 * does not offer Apple Music, so the section does not appear before it works.
 */
export function AppleMusicSettings({ authHeaders, tempoId }: { authHeaders: () => Record<string, string>; tempoId: string }) {
    const [status, setStatus] = useState<LinkedAccountsStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    /** Whether this device is the one handing the server tokens. */
    const [isLinkedHere, setIsLinkedHere] = useState(true);
    /**
     * In a browser, whether MusicKit is ready to open Apple's sign-in straight
     * from a tap. Before then the tap would open it too late, and Safari would
     * block it.
     */
    const [ready, setReady] = useState(Capacitor.getPlatform() !== "web");

    useEffect(() => {
        let cancelled = false;

        getLinkedAccounts(authHeaders())
            .then(next => {
                if (cancelled)
                    return;

                setStatus(next);

                // So that tapping "Link" can open Apple's sign-in at once;
                // only when there is a link to make
                const apple = next.accounts.appleMusic;

                linkedHere().then(id => {
                    if (cancelled)
                        return;

                    const here = (id === tempoId);

                    setIsLinkedHere(here);

                    // Only where there is a link to make: getting ready signs
                    // MusicKit out, which a working link here must not be
                    if (next.appleMusicAvailable && canLinkAppleMusicHere() && (!apple || apple.needsToken || !here)) {
                        prepareAppleMusicLink(authHeaders())
                            .then(() => { if (!cancelled) setReady(true); })
                            .catch(ex => console.warn("Could not get Apple Music ready:", ex));
                    }
                });
            })
            .catch(ex => console.warn("Could not read linked accounts:", ex));

        return () => { cancelled = true; };
    }, [authHeaders, tempoId]);

    const link = useCallback(async () => {
        setBusy(true);
        setMessage(null);

        try {
            const next = await linkAppleMusic(authHeaders(), tempoId);

            setStatus(current => (current ? { ...current, accounts: next.accounts } : current));
            setIsLinkedHere(true);
            setMessage("Tempo will start keeping your Apple Music listening from now on.");
        } catch (ex) {
            setMessage(ex instanceof Error ? ex.message : "Apple Music could not be linked. Try again in a moment.");
        } finally {
            setBusy(false);
        }
    }, [authHeaders, tempoId]);

    const unlink = useCallback(async () => {
        if (!confirm("Unlink Apple Music?\n\nWhat you have already played stays in your history. Tempo stops keeping anything new from Apple Music."))
            return;

        setBusy(true);
        setMessage(null);

        try {
            const next = await unlinkAppleMusic(authHeaders());

            setStatus(current => (current ? { ...current, accounts: next.accounts } : current));
        } catch (ex) {
            setMessage(ex instanceof Error ? ex.message : "Apple Music could not be unlinked.");
        } finally {
            setBusy(false);
        }
    }, [authHeaders]);

    if (!status?.appleMusicAvailable)
        return null;

    const linked = status.accounts.appleMusic;
    const linkable = canLinkAppleMusicHere();

    let description: string;

    if (!linked)
        description = "Link Apple Music to keep what you play there too. Spotify stays linked, and Tempo follows both.";
    else if (linked.needsToken)
        description = "Apple Music needs you to sign in again before Tempo can see what you play there.";
    else if (!isLinkedHere && linkable)
        description = "Tempo is keeping what you play on Apple Music. Apple Music was linked from another device; use this one too so Tempo stays signed in from here.";
    else
        description = "Tempo is keeping what you play on Apple Music. It checks every few minutes, so plays arrive a little after you hear them.";

    // A healthy link made elsewhere, or before this device remembered making
    // it, can be taken up here, so this device keeps its token fresh
    const offerLink = linkable && (!linked || linked.needsToken || !isLinkedHere);

    return (
        <>
            <Divider />

            <VStack alignItems="flex-start" gap="0px">
                <HStack spacing="8px" alignItems="center" mb={2}>
                    <Heading fontSize="26px" textAlign="left">Apple Music</Heading>
                    <SiApplemusic size="18px" style={{ marginTop: "4px", opacity: 0.85 }} />
                </HStack>
                <Text fontSize="sm" mb={3.5} color="gray.400">
                    {description}
                    {!linkable && (!linked || linked.needsToken) && (
                        <>
                            <br /><br />
                            Linking Apple Music works from the iPhone app or tempo in a browser.
                        </>
                    )}
                </Text>
                {message && (
                    <Text fontSize="sm" mb={3.5} color="gray.300">{message}</Text>
                )}
                <HStack spacing="8px">
                    {offerLink && (
                        <Button colorScheme="accent.dark" variant="outline" size="sm" isLoading={busy || !ready} onClick={link}>
                            {!linked ? "Link Apple Music" : linked.needsToken ? "Sign in to Apple Music again" : "Use this device"}
                        </Button>
                    )}
                    {linked && (
                        <Button variant="ghost" size="sm" isDisabled={busy} onClick={unlink}>
                            Unlink
                        </Button>
                    )}
                </HStack>
            </VStack>
        </>
    );
}
