import User, { UserFriendship } from "@/lib/usrlib";
import { Avatar, Box, Button, HStack, Image, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
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
}>) {
    const [pfpLoadFailed, setPfpLoadFailed] = useState<boolean>(false);
    const [processing, setProcessing] = useState<boolean>(false);
    const [localSent, setLocalSent] = useState<boolean>(false);
    const [localFriends, setLocalFriends] = useState<boolean>(false);
    
    return (<>
        {!firstItem && (
            <Box marginTop="10px" marginBottom="10px" width="100%" height="1px" background="rgba(255, 255, 255, 0.05)" />
        )}
        <HStack gap="15px" position="relative">
            {(pfpUrl && pfpUrl !== "" && !pfpLoadFailed) ? (
                <Image
                    width={friendsView ? "48px" : "36px"}
                    height={friendsView ? "48px" : "36px"}
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
                    width={friendsView ? "48px" : "36px"}
                    height={friendsView ? "48px" : "36px"}
                />
            )}
            <Stack gap="0px">
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
                {friendsView && (
                    <Text
                        fontFamily="Inter"
                        fontWeight="regular"
                        fontSize="16px"
                        opacity="0.75"
                        marginTop="-5px"
                        userSelect="none"
                    >Placeholder</Text>
                )}
            </Stack>
            {friendsView ? (<>
                {/* Send message button */}
                <Box height="100%" pos="absolute" right="0" display="flex" alignItems="center">
                    <FaPaperPlane size="28px" />
                </Box>
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
                            alert("Failed to send friend request, please try again later.");
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