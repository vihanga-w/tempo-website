import { Box, HStack, Image, Stack, Text } from "@chakra-ui/react";
import { InitialAvatar } from "./initial-avatar";
import { FriendRecentActivity } from "@/lib/usrlib";
import { getSizedImageUrl } from "@/lib/sized-img";
import { findBestSCDNImageSize } from "@/lib/utils";

/**
 * How long ago, in as few characters as possible.
 *
 * Deliberately coarse. A friend who stopped listening 47 minutes ago is, for
 * the purposes of this row, someone who was listening within the hour, and
 * "47m ago" invites a precision the underlying timestamp does not really have -
 * history is written when a play finishes, not when it was heard.
 */
export function describeWhen(timestamp: number, now: number = Date.now()): string {
    const elapsed = Math.max(0, now - timestamp);

    const MINUTE = 60e3;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;

    if (elapsed < 5 * MINUTE)
        return "just now";

    if (elapsed < HOUR)
        return `${Math.round(elapsed / MINUTE)}m ago`;

    if (elapsed < DAY)
        return `${Math.floor(elapsed / HOUR)}h ago`;

    if (elapsed < 2 * DAY)
        return "yesterday";

    return `${Math.floor(elapsed / DAY)}d ago`;
}

/**
 * What to call a run of tracks.
 *
 * The newest one is named because it is the one they were actually listening
 * to; the rest are represented by the artwork fanned out beside it. Naming all
 * of them would need a row per track and turn the section into a feed.
 */
export function describeTracks(activity: FriendRecentActivity): string {
    const newest = activity.tracks[0]?.track;

    if (!newest)
        return "";

    const others = activity.playCount - 1;

    if (others <= 0)
        return newest.name;

    return `${newest.name} +${others.toString()} more`;
}

/** How many covers the deck shows before it stops being legible. */
const MAX_FANNED = 3;

/** How far each cover behind the newest peeks out. */
const FAN_OFFSET = 13;

/** One cover's edge. */
const COVER_SIZE = 32;

/**
 * The deck occupies a full three covers' worth whether or not it has three.
 *
 * Sized to the maximum rather than the contents so every row's text starts at
 * the same place. Letting it shrink left a ragged column of names down the
 * section - a friend who played one track pulled their name 26px left of a
 * friend who played three - which reads as a rendering fault rather than as
 * information.
 */
const DECK_WIDTH = COVER_SIZE + ((MAX_FANNED - 1) * FAN_OFFSET);

/**
 * One friend's recent listening, as a fixed-height row.
 *
 * Fixed height is what lets the section be the elastic one on the page: the
 * caller can work out how many rows fit in the space left over without
 * measuring anything, which it could not do if a row grew with its content.
 */
export function FriendRecentActivityRow({
    activity,
    openPubProfile,
    now,
}: Readonly<{
    activity: FriendRecentActivity;
    openPubProfile: (id: string) => void;
    /** Passed in so a list of rows all agree on what "now" is. */
    now?: number;
}>) {
    const covers = activity.tracks.slice(0, MAX_FANNED);
    const pfp = activity.pfpUrl ? findBestSCDNImageSize([{ url: activity.pfpUrl, height: 64, width: 64 }], 32, 32) ?? activity.pfpUrl : undefined;

    return (<HStack
        gap="12px"
        paddingY="6px"
        cursor="pointer"
        onClick={() => openPubProfile(activity.userId)}
        aria-label={`${activity.username}, ${describeTracks(activity)}, ${describeWhen(activity.lastPlayedAt, now)}`}
        _active={{ opacity: 0.7 }}
        transition="opacity .12s"
    >
        {pfp ? (
            <Image
                width="32px"
                height="32px"
                borderRadius="10px"
                objectFit="cover"
                src={getSizedImageUrl(pfp, 34, 34)}
                alt=""
                draggable={false}
                flexShrink="0"
                opacity="0.9"
            />
        ) : (
            <InitialAvatar
                userId={activity.userId}
                displayName={activity.username}
                size="32px"
                borderRadius="10px"
                opacity={0.9}
            />
        )}

        {/*
          * The covers overlap rather than sitting in a row, so a friend who
          * played four tracks takes barely more width than one who played a
          * single track - the run reads as depth instead of length.
          */}
        <Box position="relative" width={`${DECK_WIDTH.toString()}px`} height="40px" flexShrink="0">
            {covers.map((t, i) => (
                <Image
                    key={t.songId + t.timestamp.toString()}
                    position="absolute"
                    top="4px"
                    left={`${(i * FAN_OFFSET).toString()}px`}
                    width={`${COVER_SIZE.toString()}px`}
                    height={`${COVER_SIZE.toString()}px`}
                    borderRadius="7px"
                    objectFit="cover"
                    src={getSizedImageUrl(t.track.album.artUrl, 34, 34)}
                    alt=""
                    draggable={false}
                    // Newest on top, and the ones behind it dimmed, so the deck
                    // reads front-to-back rather than as a flat smear
                    zIndex={String(covers.length - i)}
                    opacity={i === 0 ? 1 : 0.55 - (i * 0.1)}
                    boxShadow="0 0 0 2px #0D0D0E"
                />
            ))}
        </Box>

        <Stack gap="1px" flex="1" minWidth="0">
            <HStack gap="6px" minWidth="0">
                <Text
                    fontFamily="Inter"
                    fontSize="13px"
                    fontWeight="semibold"
                    color="white"
                    noOfLines={1}
                >{activity.username}</Text>

                {activity.onRepeat && (
                    <Text
                        fontFamily="Inter"
                        fontSize="10px"
                        fontWeight="semibold"
                        color="accent.dark"
                        flexShrink="0"
                        userSelect="none"
                    >on repeat</Text>
                )}
            </HStack>

            <Text
                fontFamily="Inter"
                fontSize="12px"
                color="secondary.dark"
                noOfLines={1}
            >{describeTracks(activity)}</Text>
        </Stack>

        <Text
            fontFamily="Inter"
            fontSize="11px"
            color="secondary.dark"
            flexShrink="0"
            opacity="0.75"
            userSelect="none"
        >{describeWhen(activity.lastPlayedAt, now)}</Text>
    </HStack>);
}
