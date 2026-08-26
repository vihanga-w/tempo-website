import User, { ClientUserAccount, UserFriendship } from "@/lib/usrlib";
import { Avatar, Box, HStack, Image, Spinner, Stack, Text } from "@chakra-ui/react";
import { InitialAvatar } from "./initial-avatar";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { UserLookupResult } from "./user-lookup-result";
import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import { findBestSCDNImageSize } from "@/lib/utils";
import { getSizedImageUrl } from "@/lib/sized-img";
import { FriendNowPlayingCard } from "./friend-now-playing-card";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSettledOrder } from "@/lib/use-settled-order";
import { FriendRecentActivityRow } from "./friend-recent-activity-row";
import { FriendRecentActivity } from "@/lib/usrlib";

/**
 * A heading for one of the page's three sections.
 *
 * Written the way somebody would say it, rather than set in small letterspaced
 * capitals. Two reasons beyond the tone: capitals were already spoken for -
 * the now-playing card sets a friend's name the same way, so a heading and a
 * person looked like the same kind of thing - and a heading that organises a
 * whole screen was being drawn smaller than the rows underneath it.
 */
function SectionLabel({ children, marginBottom }: Readonly<{ children: string; marginBottom: string }>) {
    return (<Text
        fontFamily="Inter"
        fontSize="14px"
        fontWeight="semibold"
        color="secondary.dark"
        marginBottom={marginBottom}
        userSelect="none"
    >{children}</Text>);
}

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

        /*
         * Whoever changed what they are playing most recently gets the space.
         *
         * These cards are capped, so the order decides who is seen at all - and
         * it was alphabetical, which promoted the same friend every time and
         * never showed another.
         *
         * Keyed on when the current song started, not on when the payload last
         * arrived. updatedAt moves every few seconds as progress is pushed, so
         * ordering by it would rearrange the cards continuously and move one
         * out from under the finger about to tap it. Where the song began only
         * moves when somebody actually changes track, which is the event worth
         * reacting to.
         *
         * A state that cannot say sorts last, so a missing value never outranks
         * a real one.
         */
        listening.sort((a, b) => {
            const songStartedAt = (friend: typeof friends[number]) => {
                const id = user.id
                    ? (friend.friendship.u1Id === user.id ? friend.friendship.u2Id : friend.friendship.u1Id)
                    : friend.user.id;

                const state = streamer?.getPrevState(id)?.data?.state;

                if (!state?.updatedAt)
                    return 0;

                const elapsed = (state.progressNormal ?? 0) * (state.duration ?? 0);

                return state.updatedAt - elapsed;
            };

            return songStartedAt(b) - songStartedAt(a);
        });

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

    /**
     * How many friends can be playing something before the live section starts
     * crowding everything else off the screen.
     *
     * Capped rather than allowed to grow, so recent activity is never pushed
     * below the fold entirely - the whole point of the section is that it is
     * visible without scrolling.
     */
    const NOW_PLAYING_CAP = 3;

    /**
     * How a card moves when the order changes.
     *
     * These reorder on their own, because somebody else changed what they were
     * playing - so the movement has to look deliberate or it reads as the page
     * glitching. Firm and quick, with most of the distance covered early and a
     * long settle, which is the difference between something being placed and
     * something falling.
     *
     * Not a spring: the overshoot reads as playful, and a friend's listening
     * rearranging itself is information rather than a toy.
     */
    const SHIFT = { duration: 0.38, ease: [0.32, 0.72, 0, 1] as const };

    // Somebody who has asked for less movement gets none of this: the order
    // still changes, it simply changes instantly
    const stillness = useReducedMotion();

    const shift = stillness ? { duration: 0 } : SHIFT;

    /** Room a row needs, and what sits above and below the rows. */
    const ROW_HEIGHT = 50;
    const SECTION_LABEL_HEIGHT = 22;
    const SEE_ALL_HEIGHT = 26;

    /**
     * Clear of the bottom of the screen, whatever that means on this device.
     *
     * A constant was wrong twice over. The home indicator's height is the
     * device's to say, not ours - and the screen's corners are round, so the
     * last thing on the page is also the thing closest to where the display
     * curves away. "See all" sits at the left margin, which is exactly where
     * that curve eats into, and a row that measured as fitting would have had
     * its final line clipped by the glass.
     *
     * So: the reported inset, plus a margin wide enough to sit inside the
     * corner radius rather than under it.
     */
    const CORNER_MARGIN = 28;

    const bottomInset = useMemo(() => {
        if (typeof window === "undefined")
            return 34;

        const raw = getComputedStyle(document.documentElement)
            .getPropertyValue("--safe-area-inset-bottom")
            .trim();

        const parsed = parseFloat(raw);

        // Unset on a device without one, and on anything that reports nonsense
        return (Number.isFinite(parsed) ? parsed : 0);
    }, []);

    const BOTTOM_RESERVE = bottomInset + CORNER_MARGIN;

    /** Never worth rendering the section for fewer than this. */
    const MIN_ROWS = 2;

    const [showAllListening, setShowAllListening] = useState<boolean>(false);

    /*
     * The order the cards are actually drawn in, held to one rearrangement
     * every few seconds.
     *
     * Ordering by whoever changed track most recently is right and cannot be
     * applied the moment it happens: a friend flicking through a playlist
     * changes track every few seconds, and the cards would spend the evening
     * swapping places. Somebody starting or stopping is not held - a card must
     * never claim that a friend is playing something they are not.
     */
    const settledOrder = useSettledOrder(useMemo(
        () => listening.map(resolveFriendId),
        [listening]));

    const orderedListening = useMemo(() => {
        const byId = new Map(listening.map(v => [resolveFriendId(v), v]));

        const ordered = settledOrder
            .map(id => byId.get(id))
            .filter((v): v is typeof listening[number] => v !== undefined);

        // Anybody the settled order has not caught up with yet still belongs on
        // the page: the set is never held back, only the sequence
        for (const friend of listening) {
            if (!settledOrder.includes(resolveFriendId(friend)))
                ordered.push(friend);
        }

        return ordered;
    }, [listening, settledOrder]);

    const shownListening = showAllListening ? orderedListening : orderedListening.slice(0, NOW_PLAYING_CAP);
    const hiddenListening = orderedListening.length - shownListening.length;

    const [recentActivity, setRecentActivity] = useState<FriendRecentActivity[]>([]);
    const [showAllActivity, setShowAllActivity] = useState<boolean>(false);
    const [rowsThatFit, setRowsThatFit] = useState<number>(MIN_ROWS);

    const activityRef = useRef<HTMLDivElement>(null);

    /**
     * Refreshed when who is listening changes, as well as on mount: somebody
     * who stops playing something has just finished a track, and what they
     * finished on belongs here.
     *
     * Keyed on that set rather than on the playback tick. The tick fires every
     * few seconds as progress is pushed, and asking for a forced refresh on
     * each one meant a request per tick and a cache that was never once read -
     * to learn, almost every time, that a friend who stopped an hour ago had
     * still stopped.
     */
    const listeningKey = useMemo(
        () => listening.map(resolveFriendId).sort().join(" "),
        [listening]);

    useEffect(() => {
        let cancelled = false;

        user.getFriendsRecentActivity(listeningKey !== "")
            .then(data => { if (!cancelled) setRecentActivity(data); })
            .catch(() => { if (!cancelled) setRecentActivity([]); });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, listeningKey]);

    /**
     * How many rows fit between the top of this section and the bottom of the
     * screen.
     *
     * Measured rather than assumed. The section is last on the page, so what is
     * left for it depends on how many friends are playing something, how tall
     * the strip is, and which device this is - none of which can be known from
     * a constant, and all of which are answered by where the section starts.
     */
    useEffect(() => {
        const measure = () => {
            const node = activityRef.current;

            if (!node)
                return;

            const available = window.innerHeight - node.getBoundingClientRect().top - BOTTOM_RESERVE;
            const forRows = available - SECTION_LABEL_HEIGHT - SEE_ALL_HEIGHT;

            setRowsThatFit(Math.max(MIN_ROWS, Math.floor(forRows / ROW_HEIGHT)));
        };

        /*
         * Measured after the browser has laid the page out, and then again
         * shortly after.
         *
         * The first pass alone was wrong every time: this section is measured
         * from where it starts, and what sits above it - a friend's now-playing
         * card - arrives from the socket a moment after the first render. So it
         * measured against a page with no live section, decided it had 150px
         * more room than it does, and rendered a row too many that then hung off
         * the bottom of the screen.
         */
        const frame = requestAnimationFrame(measure);
        const settle = setTimeout(measure, 400);

        window.addEventListener("resize", measure);

        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(settle);
            window.removeEventListener("resize", measure);
        };
    }, [recentActivity.length, shownListening.length, hiddenListening, pendingRequests]);

    // One "now" for every row, so two rows written in the same render cannot
    // disagree about how long ago the same moment was
    const activityNow = useMemo(() => Date.now(), [recentActivity]);

    const visibleActivity = showAllActivity ? recentActivity : recentActivity.slice(0, rowsThatFit);

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
                <Box marginBottom="24px">
                    <SectionLabel marginBottom="6px">Your friends</SectionLabel>

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
                    <SectionLabel marginBottom="8px">Listening now</SectionLabel>

                    {/* Relative, because a card on its way out is taken out of
                        the flow and positioned against this. */}
                    <Stack gap="17px" position="relative">
                    {/*
                      * popLayout, not the default.
                      *
                      * A friend arriving from behind "more listening" pushes
                      * another past the cap, so one card enters and one leaves
                      * at once. Left in the flow while it fades, the leaving
                      * card holds its space for the length of the animation -
                      * the section stands a card taller than it has any right
                      * to, everything below is pushed down, and both snap back
                      * when the fade ends. Taken out of the flow, the cards
                      * that remain close the gap straight away and the one
                      * leaving fades over the top of them.
                      */}
                    <AnimatePresence initial={false} mode="popLayout">
                    {shownListening.map(friend => {
                        const id = resolveFriendId(friend);

                        return (<motion.div
                            /*
                             * Keyed on the friend, not the position, which is
                             * what lets a card be recognised in its new place
                             * rather than redrawn there.
                             */
                            key={friend.friendship.id}
                            layout
                            transition={shift}
                            /*
                             * Arriving and leaving are not slides. A friend who
                             * has just started listening has no previous place
                             * to have come from, and sliding in from one would
                             * describe a move that did not happen.
                             */
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                        >
                            <FriendNowPlayingCard
                                userId={id}
                                username={friend.user.displayName}
                                pfpUrl={friend.user.images?.length > 0 ? findBestSCDNImageSize(friend.user.images, 56, 56) ?? undefined : undefined}
                                pfpColourBlob={friend.user.profilePictureColourBlob}
                                streamer={streamer}
                                openPubProfile={openPubProfile}
                            />
                        </motion.div>);
                    })}
                    </AnimatePresence>
                    </Stack>

                    {/* The friends held back by the cap. Named rather than
                        counted silently, so the section does not quietly lie
                        about how many people are listening. */}
                    {hiddenListening > 0 && (
                        <Text
                            fontFamily="Inter"
                            fontSize="12px"
                            fontWeight="semibold"
                            color="accent.dark"
                            marginTop="11px"
                            cursor="pointer"
                            userSelect="none"
                            onClick={() => setShowAllListening(true)}
                        >+{hiddenListening} more listening &rsaquo;</Text>
                    )}
                </Box>
            )}

            {/*
              * What friends who are not playing anything were listening to.
              *
              * Last on the page and elastic: it renders as many rows as fit in
              * whatever is left, which is why the live section above it is
              * capped. The ref is what the measurement reads, so it stays
              * mounted even while the list is empty.
              */}
            <Box ref={activityRef} marginTop="24px">
                {recentActivity.length > 0 && (<>
                    <SectionLabel marginBottom="5px">Recent activity</SectionLabel>

                    <Stack gap="0px" position="relative">
                        <AnimatePresence initial={false} mode="popLayout">
                        {visibleActivity.map(activity => (
                            <motion.div
                                key={activity.userId}
                                layout
                                transition={shift}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                <FriendRecentActivityRow
                                    activity={activity}
                                    openPubProfile={openPubProfile}
                                    now={activityNow}
                                />
                            </motion.div>
                        ))}
                        </AnimatePresence>
                    </Stack>

                    {!showAllActivity && recentActivity.length > visibleActivity.length && (
                        <Text
                            fontFamily="Inter"
                            fontSize="12px"
                            fontWeight="semibold"
                            color="accent.dark"
                            marginTop="8px"
                            cursor="pointer"
                            userSelect="none"
                            onClick={() => setShowAllActivity(true)}
                        >See all {recentActivity.length} &rsaquo;</Text>
                    )}
                </>)}
            </Box>

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