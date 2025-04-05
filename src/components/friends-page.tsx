import User, { ClientUserAccount, UserFriendship } from "@/lib/usrlib";
import { Box, Image, Spinner, Text } from "@chakra-ui/react";
import { use, useEffect, useState } from "react";
import { UserLookupResult } from "./user-lookup-result";

export default function FriendsPage({
    user,
}: {
    user: User;
}) {
    const [friends, setFriends] = useState<{
        user: ClientUserAccount;
        friendship: UserFriendship;
    }[]>(user.friends);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
        if (friends.length > 0) {
            setIsLoading(false);
        }

        if (user.friends.length > 0) {
            setFriends([...user.friends]);
        }

        user.on("friends-updated", (friends) => {
            setFriends([...friends]);
            setIsLoading(false);
        });

        user.refreshDetails();
    }, []);

    useEffect(() => {
        setFriends([...user.friends]);
    }, [user.friends]);

    useEffect(() => {
        if (friends.length > 0) {
            setTimeout(() => {
                setIsLoading(false);
            }, 1e3);
        } else {
            setIsLoading(true);
        }
    }, [friends]);

    return (<Box width="100%" paddingTop="20px">
        <Spinner
            pos="fixed"
            top="0"
            bottom="0"
            left="0"
            right="0"
            margin="auto"
            display={isLoading ? "block" : "none"}
            size="lg"
        />
        {friends.length > 0 ? (
            friends.map((friend, i) => (
                <UserLookupResult
                    userId={friend.user.id}
                    username={friend.user.displayName}
                    pfpUrl={friend.user.images.length > 0 ? friend.user.images[0].url : undefined}
                    firstItem={i === 0}
                    mutualFriends={[]}
                    friendState={friend.friendship.state}
                    friendshipId={friend.friendship.id}
                    user={user}
                    key={i}

                    friendsView
                />
            ))
        ) : (<Box display={isLoading ? "none" : "block"}>
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