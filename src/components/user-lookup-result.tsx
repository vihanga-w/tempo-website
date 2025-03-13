import { Avatar, Box, HStack, Image, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

export type UserLookupResultType = {
    id: string;
    username: string;
    pfpUrl?: string;
};

export function UserLookupResult({
    userId,
    username,
    pfpUrl,
    firstItem,
    onClick,
}: Readonly<{
    userId: string;
    username: string;
    pfpUrl?: string;
    firstItem: boolean;
    onClick: (userId: string) => void;
}>) {
    const [pfpLoadFailed, setPfpLoadFailed] = useState<boolean>(false);
    
    return (<>
        {!firstItem && (
            <Box marginTop="10px" marginBottom="10px" width="100%" height="1px" background="rgba(255, 255, 255, 0.05)" />
        )}
        <HStack gap="15px" position="relative">
            {/* Box overlay to handle touch events */}
            <Box
                width="100%"
                height="100%"
                background="transparent"
                position="absolute"
                top="0"
                left="0"
                zIndex="7"
                onClick={()=> {
                    onClick(userId);
                }}
            />
            {(pfpUrl && pfpUrl !== "" && !pfpLoadFailed) ? (
                <Image
                    width="36px"
                    height="36px"
                    objectFit="cover"
                    borderRadius="6px"
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
                    borderRadius="6px"
                    width="36px"
                    height="36px"
                />
            )}
            <Stack gap="0px">
                <Text
                    fontFamily="Inter"
                    fontWeight="medium"
                    fontSize="18px"
                    userSelect="none"
                >{username}</Text>
                <Text
                    fontFamily="Inter"
                    fontWeight="regular"
                    fontSize="16px"
                    opacity="0.75"
                    marginTop="-5px"
                    userSelect="none"
                >{"Not listening to anything"}</Text>
            </Stack>
        </HStack>
    </>);
}