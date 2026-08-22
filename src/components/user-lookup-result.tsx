import { setCachedObject } from "@/lib/client-cache";
import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import { getSizedImageUrl } from "@/lib/sized-img";
import User, { UserFriendship } from "@/lib/usrlib";
import { Avatar, Box, Button, HStack, Image, Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { FaPaperPlane, FaPlane } from "react-icons/fa6";

export type UserLookupResultType = {
    id: string;
    username: string;
    pfpUrl?: string;
    mutual: UserFriendship[];
    frState: UserFriendship["state"] | "incoming" | "none";
    frId?: string;
};

export function UserLookupResult({
    userId,
    username,
    pfpUrl,
    firstItem,
    mutualFriends,
    friendState,
    friendshipId,
    friendsView,
    user,
    streamer,
    openPubProfile,
}: Readonly<{
    userId: string;
    username: string;
    pfpUrl?: string;
    firstItem: boolean;
    mutualFriends: UserFriendship[];
    friendState: UserLookupResultType["frState"];
    friendshipId?: string;
    friendsView?: boolean;
    user: User;
    streamer?: DataStreamer | null;
    openPubProfile?: (id: string) => void;
}>) {
    const [pfpLoadFailed, setPfpLoadFailed] = useState<boolean>(false);
    const [processing, setProcessing] = useState<boolean>(false);
    const [localSent, setLocalSent] = useState<boolean>(false);
    const [localFriends, setLocalFriends] = useState<boolean>(false);
    const [livePlaybackState, setLivePlaybackState] = useState<UpdateEvent["data"]["state"]>();
    const [overflow, setOverflow] = useState<number>(-1);
    const [textWidth, setTextWidth] = useState<number>(-1);
    const [fact, setFact] = useState<string>("");
    const [progress, setProgress] = useState<number>(0);

    const scrollItemRef = useRef<HTMLDivElement>(null);

    function textWidthCalc(text: string, font: string) {
        font = font || "16px Arial"
        
        const c = document.createElement('canvas');
        const ctx = c.getContext("2d");

        if (ctx)
            ctx.font = font;

        return ctx?.measureText(text).width;
    }

    useEffect(() => {
        if (!scrollItemRef.current)
            return;

        if (textWidth == -1)
            return;

        if (textWidth <= window.innerWidth - 135)
            return;

        const process = () => {
            if (scrollItemRef.current)
                scrollItemRef.current.style.transition = "transform 5s";

            if (textWidth <= window.innerWidth - 135)
                return;

            if (scrollItemRef.current && overflow <= 0)
                setOverflow(textWidth - (window.innerWidth - 125));
            else
                setOverflow(0);
        }

        if (overflow == -1)
            setTimeout(() => { process() }, 2500);

        setTimeout(() => { process() }, 7500);
    }, [scrollItemRef, overflow, textWidth]);

    useEffect(() => {
        if (!scrollItemRef.current)
            return;

        console.log("reset")

        if (scrollItemRef.current) {
            scrollItemRef.current.style.transition = "none";
            setOverflow(0);

            setTimeout(() => {
                if (scrollItemRef.current) {
                    scrollItemRef.current.style.transition = "transform 5s";
                }
            }, 50); // Small delay to ensure transition reset
        }
    }, [scrollItemRef, textWidth])

    useEffect(() => {
        if (!streamer)
            return;

        const apply = (d: UpdateEvent) => {
            setLivePlaybackState(d.data.state);

            // interpolatedProgress is recomputed on an animation frame between
            // server updates, so the bar advances smoothly rather than stepping
            // once every poll
            setProgress(d.data.interpolatedProgress ?? d.data.state?.progressNormal ?? 0);
        };

        const prev = streamer.getPrevState(userId);

        if (prev)
            apply(prev);

        const onUpdate = (d: unknown) => apply(d as UpdateEvent);
        const onRemove = (id: string) => {
            if (id === userId) {
                setLivePlaybackState(undefined);
                setProgress(0);
            }
        };

        streamer.on(`update-${userId}`, onUpdate);
        streamer.on("remove", onRemove);

        return () => {
            streamer.off?.(`update-${userId}`, onUpdate);
            streamer.off?.("remove", onRemove);
        };
    }, [streamer, userId]);

    useEffect(() => {
        const width = textWidthCalc(fact, "16px Inter");

        setTextWidth(width ?? -1);
    }, [fact]);

    useEffect(() => {
        if (!livePlaybackState)
            return;

        setFact(`Listening to ${livePlaybackState.name} - ${livePlaybackState.artists.map(v => v.name).join(", ")}`);
    }, [livePlaybackState]);
    
    const formatTime = (ms: number) => {
        const total = Math.max(0, Math.floor(ms / 1000));
        const mins = Math.floor(total / 60);
        const secs = total % 60;

        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    // Compact "now playing" row used on the Listening tab
    if (friendsView) {
        const playing = livePlaybackState;
        const isPlaying = playing?.isPlaying ?? false;
        const pct = Math.min(Math.max(progress, 0), 1) * 100;
        const remaining = playing ? Math.max(0, playing.duration - (progress * playing.duration)) : 0;

        return (<>
            {!firstItem && (
                <Box height="1px" width="100%" background="rgba(255,255,255,0.06)" marginY="14px" />
            )}
            <HStack
                gap="14px"
                align="center"
                position="relative"
                paddingY="2px"
                cursor={openPubProfile ? "pointer" : "default"}
                onClick={() => openPubProfile?.(userId)}
            >
                {/* Avatar, ringed while something is playing */}
                <Box
                    minWidth="52px"
                    minHeight="52px"
                    width="52px"
                    height="52px"
                    borderRadius="15px"
                    padding={playing ? "2px" : "0px"}
                    background={playing
                        ? "linear-gradient(135deg, #3B44FF, #A480FF)"
                        : "transparent"}
                    transition="padding .2s ease, background .2s ease"
                >
                    {(pfpUrl && pfpUrl !== "" && !pfpLoadFailed) ? (
                        <Image
                            width="100%"
                            height="100%"
                            objectFit="cover"
                            borderRadius={playing ? "13px" : "15px"}
                            src={getSizedImageUrl(pfpUrl, 56, 56)}
                            draggable={false}
                            onError={() => setPfpLoadFailed(true)}
                        />
                    ) : (
                        <Avatar
                            name={username + userId}
                            width="100%"
                            height="100%"
                            borderRadius={playing ? "13px" : "15px"}
                        />
                    )}
                </Box>

                {/* Name, track, progress */}
                <Stack gap="3px" flex="1" minWidth="0">
                    <HStack gap="8px" align="baseline" minWidth="0">
                        <Text
                            fontFamily="Inter"
                            fontWeight="semibold"
                            fontSize="17px"
                            lineHeight="1.2"
                            userSelect="none"
                            whiteSpace="nowrap"
                            overflow="hidden"
                            textOverflow="ellipsis"
                        >{username}</Text>

                        {playing && !isPlaying && (
                            <Text
                                fontFamily="Inter"
                                fontSize="11px"
                                letterSpacing="0.06em"
                                textTransform="uppercase"
                                color="secondary.dark"
                                userSelect="none"
                                flexShrink="0"
                            >Paused</Text>
                        )}
                    </HStack>

                    <Text
                        fontFamily="Inter"
                        fontWeight="regular"
                        fontSize="14px"
                        lineHeight="1.3"
                        color="text.color"
                        opacity={playing ? 0.72 : 0.45}
                        userSelect="none"
                        whiteSpace="nowrap"
                        overflow="hidden"
                        textOverflow="ellipsis"
                    >
                        {playing
                            ? `${playing.name} · ${playing.artists.map(v => v.name).join(", ")}`
                            : "You are friends"}
                    </Text>

                    {playing && (
                        <HStack gap="8px" align="center" marginTop="4px">
                            <Box
                                flex="1"
                                height="3px"
                                borderRadius="2px"
                                background="rgba(255,255,255,0.09)"
                                overflow="hidden"
                                minWidth="0"
                            >
                                <Box
                                    height="100%"
                                    width={`${pct}%`}
                                    borderRadius="2px"
                                    background="accent.dark"
                                    opacity={isPlaying ? 1 : 0.45}
                                    // Short transition smooths the animation-frame
                                    // updates without lagging behind real progress
                                    transition="width .25s linear, opacity .2s ease"
                                />
                            </Box>
                            <Text
                                fontFamily="Inter"
                                fontSize="11px"
                                color="secondary.dark"
                                userSelect="none"
                                flexShrink="0"
                                sx={{ fontVariantNumeric: "tabular-nums" }}
                            >-{formatTime(remaining)}</Text>
                        </HStack>
                    )}
                </Stack>

                {/* What they are listening to */}
                {playing && playing.imageUrl && (
                    <Image
                        width="46px"
                        height="46px"
                        minWidth="46px"
                        borderRadius="10px"
                        objectFit="cover"
                        src={getSizedImageUrl(playing.imageUrl, 48, 48)}
                        alt=""
                        draggable={false}
                        opacity={isPlaying ? 1 : 0.5}
                        transition="opacity .2s ease"
                        border="1px solid rgba(255,255,255,0.08)"
                    />
                )}
            </HStack>
        </>);
    }

    return (<>
        {!firstItem && (
            <Box marginTop="10px" marginBottom="10px" width="100%" height="1px" background="rgba(255, 255, 255, 0.05)" />
        )}
        <HStack gap="15px" position="relative" onClick={() => {
            if (openPubProfile)
                openPubProfile(userId);
        }}>
            <Box
                minWidth={friendsView ? "52px" : "36px"}
                minHeight={friendsView ? "52px" : "36px"}
                borderRadius="12px"
                border={livePlaybackState ? "2px solid #A480FF" : "0px"}
                transition=".15s"
            >
                {(pfpUrl && pfpUrl !== "" && !pfpLoadFailed) ? (
                    <Image
                        width={friendsView ? (livePlaybackState ? "48px" : "52px") : "36px"}
                        height={friendsView ? (livePlaybackState ? "48px" : "52px") : "36px"}
                        border={livePlaybackState ? "2px solid #0D0D0E" : "0px"}
                        transition=".15s"
                        objectFit="cover"
                        borderRadius="10px"
                        src={getSizedImageUrl(pfpUrl, !friendsView ? 36 : 56, !friendsView ? 36 : 56)}
                        draggable={false}
                        onError={() => {
                            setPfpLoadFailed(true);
                        }}
                    />
                ) : (
                    <Avatar
                        // Append user id so that different users potentially with same name has different bg colours
                        name={username + userId}
                        borderRadius="10px"
                        width={friendsView ? (livePlaybackState ? "48px" : "52px") : "36px"}
                        height={friendsView ? (livePlaybackState ? "48px" : "52px") : "36px"}
                        border={livePlaybackState ? "2px solid #0D0D0E" : ""}
                        transition=".15s"
                    />
                )}
            </Box>
            <Stack gap="0px" overflowX="hidden" whiteSpace="nowrap" marginRight="15px">
                <Text
                    fontFamily="Inter"
                    fontWeight="medium"
                    fontSize={friendsView ? "20px" : "18px"}
                    userSelect="none"
                >{username}</Text>
                {!friendsView && (
                    <Text
                        fontFamily="Inter"
                        fontWeight="regular"
                        fontSize="16px"
                        opacity="0.75"
                        marginTop="-5px"
                        userSelect="none"
                    >{mutualFriends.length} mutual friend{mutualFriends.length !== 1 ? "s" : ""}</Text>
                )}
                {friendsView && (<Box>
                    <Text
                        fontFamily="Inter"
                        fontWeight="regular"
                        fontSize="16px"
                        opacity="0.75"
                        marginTop="-5px"
                        userSelect="none"
                        ref={scrollItemRef}
                        transform={`translateX(-${overflow}px)`}
                        transition="transform 5s"
                        display="inline-block"
                        key={livePlaybackState ? fact : "You are friends"}
                    >{livePlaybackState ? fact : "You are friends"}</Text>
                    {/* TODO: Show something else if fact not provided */}
                </Box>)}
            </Stack>
            {friendsView ? (<>
                {/* Send message button */}
                {/* <Box height="100%" pos="absolute" right="0" display="flex" alignItems="center">
                    <FaPaperPlane size="28px" />
                </Box> */}
            </>) : (
                <Button
                    pos={"absolute"}
                    right="0"
                    size="sm"
                    width="80px"
                    background={"accent.dark"}
                    onClick={() => {
                        if (friendState == "request" || localSent)
                            return;

                        if (friendState == "incoming" && friendshipId) {
                            console.log(`Accepting friend request from user: ${userId}, friendshipId: ${friendshipId}`);

                            setProcessing(true);

                            user.acceptFriendRequest(friendshipId)
                            .then(() => {
                                console.log("Friend request accepted successfully");

                                setProcessing(false);
                                setLocalSent(false);
                                setLocalFriends(true);

                                setCachedObject("tempo-me-friends-cache-friends", undefined);
                            })
                            .catch((ex) => {
                                console.warn("Failed to accept friend request, error:", ex);
                                
                                setProcessing(false);
                                setLocalSent(false);
                                setLocalFriends(false);

                                alert("Failed to accept friend request, please try again later.");
                            });

                            return;
                        } else if (friendState == "incoming" && !friendshipId) {
                            console.warn("Failed to accept friend request, no friendshipId provided");
                            alert("Failed to accept friend request, please try again later.");

                            return;
                        }

                        console.log(`Sending friend request to user: ${userId}`);

                        setProcessing(true);

                        user.sendFriendRequest(userId)
                        .then(() => {
                            console.log("Friend request sent successfully");
                            
                            setLocalSent(true);
                            setProcessing(false);
                        })
                        .catch((ex) => {
                            console.warn("Failed to send friend request, error:", ex);
                            setProcessing(false);
                            setLocalSent(false);
                            alert("Failed to send friend request, please try again later. Error: " + ex.toString());
                        });
                    }}
                    disabled={processing || (friendState == "request" || localSent) || (friendState == "friends" || localFriends)}
                    opacity={(friendState == "request" || localSent) || (friendState == "friends" || localFriends) ? 0.6 : 1}
                    isLoading={processing}
                    pointerEvents={processing || (friendState == "request" || localSent) || (friendState == "friends" || localFriends) ? "none" : "auto"}
                >
                    {(friendState == "request" || localSent) ? "Sent" : (friendState == "friends" || localFriends) ? "Friends" : friendState == "incoming" ? "Accept" : "+ Friend"}
                </Button>
            )}
        </HStack>
    </>);
}