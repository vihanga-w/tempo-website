import { avatarColour, avatarInitial } from "@/lib/avatar-colour";
import { Box, Text } from "@chakra-ui/react";

/**
 * Stands in for a profile picture nobody has set.
 *
 * Colour comes from the account id, so a person looks the same everywhere
 * regardless of whether that screen shows their display name or their username.
 */
export function InitialAvatar({
    userId,
    displayName,
    size,
    borderRadius = "full",
    opacity,
    fontSize,
    border,
    transition,
}: Readonly<{
    userId: string;
    displayName?: string;
    size: string;
    borderRadius?: string;
    opacity?: number;
    fontSize?: string;
    border?: string;
    transition?: string;
}>) {
    const colour = avatarColour(userId);

    return (
        <Box
            width={size}
            height={size}
            minWidth={size}
            borderRadius={borderRadius}
            backgroundImage={colour.gradient}
            opacity={opacity}
            border={border}
            transition={transition}
            display="flex"
            alignItems="center"
            justifyContent="center"
            userSelect="none"
        >
            <Text
                // Scaled to the box, so one component covers a 15px badge and a
                // 72px podium picture without a size passed for each
                fontSize={fontSize ?? `calc(${size} * 0.44)`}
                lineHeight="1"
                fontWeight="bold"
                color={colour.ink}
            >
                {avatarInitial(displayName)}
            </Text>
        </Box>
    );
}
