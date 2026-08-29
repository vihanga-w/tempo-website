import { Box, HStack, Image, Text } from "@chakra-ui/react";

import { timeAgo } from "@/lib/time-ago";
import { getSizedImageUrl } from "@/lib/sized-img";
import { InitialAvatar } from "./initial-avatar";

export interface DiscoverSource {
    userId: string;
    username: string;
    pfpUrl?: string;
    pfpColourBlob?: string;
    playedAt: number;
    familiarArtist: boolean;
}

/**
 * Whose play a recommendation came from.
 *
 * The point of the row is that a Discover card is not an algorithm's opinion —
 * it is something a specific person actually played, recently. Without it the
 * card is indistinguishable from any other recommender, and the listener has no
 * reason to trust it over one.
 *
 * It says nothing the Friends tab does not already show about that person.
 */
export function DiscoverAttribution({
    source,
    colour,
    onOpenProfile,
}: Readonly<{
    source: DiscoverSource;
    colour: string;
    onOpenProfile?: (userId: string) => void;
}>) {
    const tappable = !!onOpenProfile;

    return (
        <HStack
            spacing="8px"
            marginTop="14px"
            paddingY="6px"
            paddingX="10px"
            borderRadius="full"
            background="blackAlpha.300"
            cursor={tappable ? "pointer" : "default"}
            role={tappable ? "button" : undefined}
            tabIndex={tappable ? 0 : undefined}
            aria-label={tappable ? `Open ${source.username}'s profile` : undefined}
            onClick={() => onOpenProfile?.(source.userId)}
            onKeyDown={e => {
                if (tappable && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onOpenProfile?.(source.userId);
                }
            }}
        >
            {source.pfpUrl ? (
                <Image
                    src={getSizedImageUrl(source.pfpUrl, 40, 40)}
                    alt=""
                    width="20px"
                    height="20px"
                    borderRadius="full"
                    objectFit="cover"
                    draggable="false"
                />
            ) : (
                <InitialAvatar
                    userId={source.userId}
                    displayName={source.username}
                    size="20px"
                    fontSize="10px"
                />
            )}

            <Text fontSize="13px" color={colour} noOfLines={1}>
                <Box as="span" fontWeight="600">{source.username}</Box>
                <Box as="span" opacity={0.7}> · {timeAgo(source.playedAt)}</Box>
            </Text>
        </HStack>
    );
}

/**
 * Marks a pick by somebody the listener has never played.
 *
 * The ranker keeps two lanes and interleaves them, so roughly a third of the
 * page is an artist new to the listener. That distinction was invisible: a
 * track worth taking a chance on looked exactly like one more from an artist
 * already on repeat.
 */
export function NewArtistBadge({ colour }: Readonly<{ colour: string }>) {
    return (
        <Box
            as="span"
            marginLeft="8px"
            paddingX="6px"
            paddingY="2px"
            borderRadius="4px"
            fontSize="11px"
            fontWeight="700"
            letterSpacing="0.06em"
            verticalAlign="middle"
            border={`1px solid ${colour}`}
            opacity={0.85}
            color={colour}
            whiteSpace="nowrap"
        >
            NEW ARTIST
        </Box>
    );
}
