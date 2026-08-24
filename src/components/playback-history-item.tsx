import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import { MdExplicit } from "react-icons/md";
import ReactTimeAgo from "react-time-ago";
import { FriendListenershipItem } from "@/lib/usrlib";
import { getSizedImageUrl } from "@/lib/sized-img";
import { memo } from "react";
import { SkeletonImage } from "./playback-state";

const INK = "#f5f5f5";
const INK_DIM = "#a0a0a0";
const INK_FAINT = "#6b6b6b";

/** How long ago the app switches from "20 minutes ago" to a date and a time. */
const RELATIVE_WINDOW_MS = 3600e3 * 12;

function formatTime(ms: number) {
  if (ms < 0)
    ms = 0;

  const seconds = ms / 1e3;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

function getSpotifyDeeplink(trackId: string, itemType: FriendListenershipItem["item"]["track"]["type"]) {
  return (itemType == "track" ? `spotify://track/${trackId}` : `spotify://episode/${trackId}`);
}

/** "09:24" — the clock time, zero padded so a column of them lines up. */
function clockTime(timestamp: number) {
  const d = new Date(timestamp).toLocaleTimeString().slice(0, 5);

  return (d.endsWith(":") ? `0${d.slice(0, 4)}` : d);
}

/**
 * One track out of somebody's listening history.
 *
 * The row is the tap target, so there is no "Play on Spotify" printed against
 * every entry. A feed of thirty of them repeated that line thirty times, in
 * brighter text than the song titles it sat beside — the loudest thing on the
 * page was the same six words over and over.
 */
export const PlaybackHistoryItem = memo(function PlaybackHistoryItem({
  data,
}: {
  data: FriendListenershipItem;
}) {
  const { track } = data.item;

  const fact = (data.item.replayed
    ? "Replayed"
    : data.item.sessionDuration !== 1
      ? `Listened for ${formatTime(track.duration * data.item.sessionDuration)}`
      : `Listened to ${track.type == "episode" ? "the episode" : "the whole song"}`);

  return (
    <HStack
      gap="12px"
      alignItems="center"
      paddingY="2px"
      cursor="pointer"
      role="button"
      aria-label={`${track.name} — open in Spotify`}
      onClick={() => {
        window.open(getSpotifyDeeplink(track.id, track.type), "_blank");
      }}
    >
      <SkeletonImage
        width="48px"
        height="48px"
        borderRadius="8px"
        src={getSizedImageUrl(track.album.artUrl, 96, 96)}
        loading="lazy"
      />

      <Stack gap="1px" flex="1" minWidth="0">
        <HStack gap="4px" minWidth="0">
          <Text fontSize="15px" fontWeight="semibold" color={INK} noOfLines={1}>
            {track.name}
          </Text>
          {track.explicit && <Box color={INK_FAINT} flexShrink={0}><MdExplicit /></Box>}
        </HStack>

        <Text fontSize="13px" color={INK_DIM} noOfLines={1}>
          {track.artists.map(v => v.name).join(", ")}
        </Text>

        <Text fontSize="12px" color={INK_FAINT} noOfLines={1}>
          {fact}
        </Text>
      </Stack>

      {/*
        * When it was, kept quiet and to the side. It used to run across the top
        * of every entry in the brightest text in the row, which made the feed
        * read as a list of times that happened to have songs attached.
        */}
      <Text fontSize="12px" color={INK_FAINT} whiteSpace="nowrap" flexShrink={0} alignSelf="flex-start" paddingTop="2px">
        {Date.now() - data.timestamp <= RELATIVE_WINDOW_MS ? (
          <ReactTimeAgo date={data.timestamp} locale="en-GB" timeStyle="twitter" />
        ) : (
          `${new Date(data.timestamp).toLocaleDateString("en-GB")} ${clockTime(data.timestamp)}`
        )}
      </Text>
    </HStack>
  );
});
