import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
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
}>) {
    const [pfpLoadFailed, setPfpLoadFailed] = useState<boolean>(false);
    const [processing, setProcessing] = useState<boolean>(false);
    const [localSent, setLocalSent] = useState<boolean>(false);
    const [localFriends, setLocalFriends] = useState<boolean>(false);
    const [livePlaybackState, setLivePlaybackState] = useState<UpdateEvent["data"]["state"]>();
    const [overflow, setOverflow] = useState<number>(-1);
    const [textWidth, setTextWidth] = useState<number>(-1);
    const [fact, setFact] = useState<string>("");

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

        const prev = streamer.getPrevState(userId);

        if (prev)
            setLivePlaybackState(prev.data.state);
        
        streamer.on(`update-${userId}`, d => {
            setLivePlaybackState((d as UpdateEvent).data.state);
        });

        streamer.on("remove", id => {
            if (id == userId)
                setLivePlaybackState(undefined);
        });
    }, [streamer]);

    useEffect(() => {
        const width = textWidthCalc(fact, "16px Inter");

        setTextWidth(width ?? -1);
    }, [fact]);

    useEffect(() => {
        if (!livePlaybackState)
            return;

        setFact(`Listening to ${livePlaybackState.name} - ${livePlaybackState.artists.map(v => v.name).join(", ")}`);
    }, [livePlaybackState]);
    
    return (<>
        {!firstItem && (
            <Box marginTop="10px" marginBottom="10px" width="100%" height="1px" background="rgba(255, 255, 255, 0.05)" />
        )}
        <HStack gap="15px" position="relative">
            <Box minWidth={friendsView ? "52px" : "36px"} minHeight={friendsView ? "52px" : "36px"} borderRadius="8px" border={livePlaybackState ? "2px solid #A480FF" : "0px"} transition=".3s">
                {(pfpUrl && pfpUrl !== "" && !pfpLoadFailed) ? (
                    <Image
                        width={friendsView ? (livePlaybackState ? "48px" : "52px") : "36px"}
                        height={friendsView ? (livePlaybackState ? "48px" : "52px") : "36px"}
                        border={livePlaybackState ? "2px solid #0D0D0E" : "0px"}
                        transition=".3s"
                        objectFit="cover"
                        borderRadius="8px"
                        src={pfpUrl}
                        draggable={false}
                        onError={() => {
                            setPfpLoadFailed(true);
                        }}
                    />
                ) : (
                    <Avatar
                        // Append user id so that different users potentially with same name has different bg colours
                        name={username + userId}
                        borderRadius="8px"
                        width={friendsView ? (livePlaybackState ? "48px" : "52px") : "36px"}
                        height={friendsView ? (livePlaybackState ? "48px" : "52px") : "36px"}
                        border={livePlaybackState ? "2px solid #0D0D0E" : ""}
                        transition=".3s"
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