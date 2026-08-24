import User, { ClientUserAccount, UserFriendship } from "@/lib/usrlib";
import { Avatar, Box, HStack, Image, Spinner, Stack, Text } from "@chakra-ui/react";
import { InitialAvatar } from "./initial-avatar";
import { use, useEffect, useMemo, useState } from "react";
import { UserLookupResult } from "./user-lookup-result";
import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import { findBestSCDNImageSize } from "@/lib/utils";
import { getSizedImageUrl } from "@/lib/sized-img";
import { FriendNowPlayingCard } from "./friend-now-playing-card";

export default function FriendsPage({
    user,
    streamer,
    openPubProfile,
    openAddFriends,
}: {
    user: User;
    streamer: DataStreamer | null;
    openPubProfile: (id: string) => void;
    openAddFriends?: () => void;
}) {
    const [friendsPre, setFriendsPre] = useState<{
        user: ClientUserAccount;
        friendship: UserFriendship;
    }[]>(user.friends);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    // Bumped when a friend's playback changes, so the ordering below is
    // recomputed without keeping a second copy of the list in state
    const [playbackTick, setPlaybackTick] = useState<number>(0);
    const [pendingRequests, setPendingRequests] = useState<number>(0);

    useEffect(() => {
        let cancelled = false;

        const onFriendsUpdated = (updated: typeof user.friends) => {
            if (cancelled)
                return;

            setFriendsPre([...updated]);
            setIsLoading(false);
        };

        if (user.friends.length > 0) {
            setFriendsPre([...user.friends]);
            setIsLoading(false);
        }

        user.on("friends-updated", onFriendsUpdated);

        // Resolve the spinner once the first refresh settles, whatever it returns
        user.refreshDetails().finally(() => {
            if (!cancelled)
                setIsLoading(false);
        });

        return () => {
            cancelled = true;

            // Without this the listener outlives the component, so every visit
            // to this page stacks another one and each event fires N setStates
            user.off?.("friends-updated", onFriendsUpdated);
        };
    }, [user]);

    /**
     * Pending friend requests, refreshed whenever the server says a friendship
     * changed. There is no polling path for friendships, so without the socket
     * event a request would sit unseen until the page was reopened.
     */
    useEffect(() => {
        let cancelled = false;

        const refresh = () => {
            user.getIncomingRequestCount()
                .then(count => { if (!cancelled) setPendingRequests(count); })
                .catch(() => { if (!cancelled) setPendingRequests(0); });
        };

        refresh();

        if (!streamer)
            return () => { cancelled = true; };

        const onFriendshipChanged = () => {
            refresh();

            // An accepted request also changes the friends list itself
            user.refreshDetails().catch(() => {});
        };

        streamer.on("friendship-changed", onFriendshipChanged);

        return () => {
            cancelled = true;
            streamer.off?.("friendship-changed", onFriendshipChanged);
        };
    }, [streamer, user]);

    useEffect(() => {
        if (!streamer)
            return;

        const onUpdate = () => setPlaybackTick(v => v + 1);

        streamer.on("update", onUpdate);
        streamer.on("remove", onUpdate);

        return () => {
            streamer.off?.("update", onUpdate);
            streamer.off?.("remove", onUpdate);
        };
    }, [streamer]);

    /**
     * Currently-playing friends first, then alphabetical.
     *
     * Derived rather than stored: the previous version kept a second copy in
     * state and re-sorted in the render body too, where Array.sort mutated the
     * state array in place. Its comparator also never returned 0 and returned 1
     * for both-playing and both-idle, which is not a valid ordering — so the
     * list could reshuffle between renders, and the alphabetical pass before it
     * was discarded entirely.
     */
    const friends = useMemo(() => {
        return [...friendsPre].sort((a, b) => {
            const aPlaying = streamer?.getPrevState(a.user.id)?.data?.state ? 1 : 0;
            const bPlaying = streamer?.getPrevState(b.user.id)?.data?.state ? 1 : 0;

            if (aPlaying !== bPlaying)
                return bPlaying - aPlaying;

            return a.user.displayName.localeCompare(b.user.displayName, undefined, { sensitivity: "base" });
        });
    }, [friendsPre, streamer, playbackTick]);

    /**
     * Anyone currently listening gets an artwork card; everyone else collapses
     * into a single avatar row. The split is derived from the same sorted list,
     * so the two sections stay consistent with each other.
     */
    const { listening, idle } = useMemo(() => {
        const listening: typeof friends = [];
        const idle: typeof friends = [];

        for (const friend of friends) {
            const id = user.id
                ? (friend.friendship.u1Id === user.id ? friend.friendship.u2Id : friend.friendship.u1Id)
                : friend.user.id;

            // Test the playback state, not the envelope. The streamer caches an
            // entry even for a STOPPED payload, where data.state is undefined —
            // bucketing on the envelope put idle friends in the listening group
            // and their card rendered nothing.
            const playing = streamer?.getPrevState(id)?.data?.state;

            (playing ? listening : idle).push(friend);
        }

        return { listening, idle };
    }, [friends, streamer, playbackTick, user.id]);

    const resolveFriendId = (friend: typeof friends[number]) => user.id
        ? (friend.friendship.u1Id === user.id ? friend.friendship.u2Id : friend.friendship.u1Id)
        : friend.user.id;

    /**
     * Strip order: anyone playing first, everyone else after, each alphabetical.
     *
     * Sorted on the friendship-derived id rather than friend.user.id, which is
     * the id the strip itself checks membership with — keying the two on
     * different values lets the order disagree with the rings it draws.
     */
    const stripFriends = useMemo(() => {
        return [...friends].sort((a, b) => {
            const aPlaying = streamer?.getPrevState(resolveFriendId(a))?.data?.state ? 1 : 0;
            const bPlaying = streamer?.getPrevState(resolveFriendId(b))?.data?.state ? 1 : 0;

            if (aPlaying !== bPlaying)
                return bPlaying - aPlaying;

            return a.user.displayName.localeCompare(b.user.displayName, undefined, { sensitivity: "base" });
        });
    }, [friends, streamer, playbackTick, user.id]);

    return (<Box width="100%" paddingTop="20px">
        <Box
            pos="fixed"
            top="0"
            left="0"
            background="#0D0D0E"
            width="100vw"
            height="100vh"
            zIndex="999999"
            display={isLoading ? "block" : "none"}
        >
            <Spinner
                pos="fixed"
                top="0"
                bottom="0"
                left="0"
                right="0"
                margin="auto"
                size="lg"
            />
        </Box>
        {friends.length > 0 ? (<>
            {pendingRequests > 0 && (
                <Box
                    marginBottom="22px"
                    padding="13px 15px"
                    borderRadius="14px"
                    background="rgba(164,128,255,0.12)"
                    border="1px solid rgba(164,128,255,0.3)"
                    cursor="pointer"
                    onClick={() => openAddFriends?.()}
                >
                    <HStack justify="space-between" align="center" gap="10px">
                        <Text
                            fontFamily="Inter"
                            fontSize="15px"
                            fontWeight="medium"
                            userSelect="none"
                        >{pendingRequests} friend request{pendingRequests === 1 ? "" : "s"}</Text>
                        <Text
                            fontFamily="Inter"
                            fontSize="13px"
                            color="accent.dark"
                            fontWeight="semibold"
                            userSelect="none"
                            flexShrink="0"
                        >View</Text>
                    </HStack>
                </Box>
            )}

            {friends.length > 0 && (
                <Box marginBottom="30px">
                    <Text
                        fontFamily="Inter"
                        fontSize="11px"
                        fontWeight="semibold"
                        letterSpacing="0.08em"
                        textTransform="uppercase"
                        color="secondary.dark"
                        marginBottom="12px"
                        userSelect="none"
                    >Your friends</Text>

                    {/* Always present, and scrolls sideways rather than wrapping,
                        so the strip stays a fixed part of the page whether anyone
                        is listening or not */}
                    <HStack
                        gap="11px"
                        overflowX="auto"
                        overflowY="hidden"
                        paddingBottom="4px"
                        marginX="-20px"
                        paddingX="20px"
                        sx={{
                            scrollbarWidth: "none",
                            "&::-webkit-scrollbar": { display: "none" },
                        }}
                    >
                        {stripFriends.map(friend => {
                            const id = resolveFriendId(friend);
                            const pfp = friend.user.images?.length > 0
                                ? findBestSCDNImageSize(friend.user.images, 56, 56) ?? undefined
                                : undefined;
                            const isListening = !!streamer?.getPrevState(id)?.data?.state;

                            return (<Box
                                key={friend.friendship.id}
                                flexShrink="0"
                                cursor="pointer"
                                onClick={() => openPubProfile(id)}
                                aria-label={friend.user.displayName}
                            >
                                <Box
                                    position="relative"
                                    borderRadius="14px"
                                    padding={isListening ? "2px" : "0px"}
                                    background={isListening ? "accent.dark" : "transparent"}
                                    transition="padding .2s ease, background .2s ease"
                                >
                                    {pfp ? (
                                        <Image
                                            width="42px"
                                            height="42px"
                                            borderRadius={isListening ? "12px" : "14px"}
                                            objectFit="cover"
                                            src={getSizedImageUrl(pfp, 44, 44)}
                                            alt=""
                                            draggable={false}
                                            opacity={isListening ? 1 : 0.72}
                                        />
                                    ) : (
                                        <InitialAvatar
                                            userId={id}
                                            displayName={friend.user.displayName}
                                            size="42px"
                                            borderRadius={isListening ? "12px" : "14px"}
                                            opacity={isListening ? 1 : 0.72}
                                        />
                                    )}
                                </Box>
                            </Box>);
                        })}
                    </HStack>
                </Box>
            )}

            {listening.length > 0 && (
                <Box>
                    <Text
                        fontFamily="Inter"
                        fontSize="11px"
                        fontWeight="semibold"
                        letterSpacing="0.08em"
                        textTransform="uppercase"
                        color="secondary.dark"
                        marginBottom="16px"
                        userSelect="none"
                    >Listening now</Text>

                    <Stack gap="20px">
                    {listening.map(friend => {
                        const id = resolveFriendId(friend);

                        return (<FriendNowPlayingCard
                            key={friend.friendship.id}
                            userId={id}
                            username={friend.user.displayName}
                            pfpUrl={friend.user.images?.length > 0 ? findBestSCDNImageSize(friend.user.images, 56, 56) ?? undefined : undefined}
                            pfpColourBlob={friend.user.profilePictureColourBlob}
                            streamer={streamer}
                            openPubProfile={openPubProfile}
                        />);
                    })}
                    </Stack>
                </Box>
            )}

        </>) : (<Box display={isLoading ? "none" : "block"}>
            <Image
                src={`/add-new-case-indication-arrow.svg`}
                position="absolute"
                right="46px"
                top="48px"
                marginTop="env(safe-area-inset-top)"
                zIndex="9999999"
            />
            <Text
                position="absolute"
                top="0"
                left="0"
                justifyContent="center"
                alignItems="center"
                display="flex"
                height="calc(100vh - 72px)"
                width="100vw"
                color="text.dark"
                margin="auto"
                textAlign="center"
                fontFamily="Inter"
                fontSize="16px"
                fontWeight="regular"
                zIndex="1"
            >
                Tempo is better with friends!
                <br />
                Why not try adding someone?
            </Text>
        </Box>)}
    </Box>);
}