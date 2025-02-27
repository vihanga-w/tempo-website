import { Box, HStack, Image, Stack, Text } from "@chakra-ui/react";

export type UserLookupResultType = {
    id: string;
    firstName: string;
    lastName: string;
    profession: string;
    gravatarHash: string;
};

export function UserLookupResult({
    userId,
    firstName,
    lastName,
    profession,
    gravatarHash,
    imageElement,
    firstItem,
    onClick,
}: Readonly<{
    userId: string;
    firstName: string;
    lastName: string;
    profession: string;
    gravatarHash: string;
    imageElement?: JSX.Element;
    firstItem: boolean;
    onClick: (userId: string) => void;
}>) {
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
            {imageElement ?? (
                <Image
                    src={`https://gravatar.com/avatar/${gravatarHash}?d=identicon&s=44`}
                    // src={"/api/public-profile/pfp/" + userId}
                    width="44px"
                    height="44px"
                    borderRadius="50%"
                    background="rgba(255, 255, 255, 0.05)"
                    draggable={false}
                />
            )}
            <Stack gap="0px">
                <Text
                    fontFamily="Inter"
                    fontWeight="medium"
                    fontSize="18px"
                    userSelect="none"
                >{firstName} {lastName}</Text>
                <Text
                    fontFamily="Inter"
                    fontWeight="regular"
                    fontSize="16px"
                    opacity="0.75"
                    marginTop="-5px"
                    userSelect="none"
                >{profession}</Text>
            </Stack>
        </HStack>
    </>);
}