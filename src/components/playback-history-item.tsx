import { Box, HStack, Image, Stack, Text } from "@chakra-ui/react";
import { MdAddReaction, MdExplicit } from "react-icons/md";
import ReactTimeAgo from "react-time-ago";
import { FriendListenershipItem } from "@/lib/usrlib";
import { getSizedImageUrl } from "@/lib/sized-img";
import React, { memo } from "react";
import { SkeletonImage } from "./playback-state";
import { FaHistory } from "react-icons/fa";

function formatTime(ms: number) {
  if (ms < 0) ms = 0;
  const seconds = ms / 1e3;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

function getSpotifyDeeplink(trackId: string, itemType: FriendListenershipItem["item"]["track"]["type"]) {
  if (itemType == "track")
    return `spotify://track/${trackId}`;
  else
    return `spotify://episode/${trackId}`;
}

function timestampToParsedTime(timestamp: number, short?: boolean) {
  const d = new Date(timestamp).toLocaleTimeString().slice(0, 5);
  return d.endsWith(":") ? `0${d.slice(0, 4)}` : d;
}

export const PlaybackHistoryItem = memo(function PlaybackHistoryItem({
  data,
}: {
  data: FriendListenershipItem;
}) {
  return (
    <Stack gap="5px" marginTop="-3px">
      {/* Header with username and timestamp */}
      <HStack gap="5px" justifyContent="space-between">
        <Text
          fontSize="14px"
          color="#b4b4b4"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {new Date().getTime() - data.timestamp <= 3600e3 * 12 ? (
            <ReactTimeAgo date={data.timestamp} locale="en-GB" />
          ) : (
            <>
              {new Date(data.timestamp).toLocaleDateString("en-GB")} at{" "}
              {timestampToParsedTime(data.timestamp)}
            </>
          )}
        </Text>
        <HStack
          gap="5px"
          onClick={() => {
            window.open(
              getSpotifyDeeplink(data.item.track.id, data.item.track.type),
              "_blank"
            );
          }}
        >
          <Box fontSize="14px">
            <Text>Play on Spotify</Text>
          </Box>
        </HStack>
      </HStack>

      {/* Song details */}
      <HStack alignItems="flex-start" spacing="3">
        <SkeletonImage
          width="64px"
          height="64px"
          borderRadius="6px"
          src={getSizedImageUrl(data.item.track.album.artUrl, 64, 64)}
          loading="lazy"
        />
        <Stack spacing="0" flex="1" pos="relative">
          <Box height="100%" pos="absolute" top="0" right="0" display="flex" flexDir="column" justifyContent="space-between">
            
          </Box>
          <HStack pos="relative" gap="5px" justifyContent="space-between">
            <HStack width="100%" gap="5px">
              {/* TODO: Make this text scroll with a fixed width */}
              <Text
                maxWidth="175px"
                fontSize="14px"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                overflow="hidden"
              >
                {data.item.track.name}
              </Text>
              {data.item.track.explicit && <MdExplicit />}
            </HStack>
          </HStack>
          <Text
            maxWidth="180px"
            fontSize="14px"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
            overflow="hidden"
            marginTop="-2px"
          >
            {data.item.track.artists.map((v) => {
              return v.name;
            }).join(", ")}
          </Text>
          <Box mt="8px">
            {data.item.replayed ? (
              <Text fontSize="12px">Replayed</Text>
            ) : data.item.sessionDuration !== 1 ? (
              <Text fontSize="12px">
                Listened for{" "}
                {formatTime(data.item.track.duration * data.item.sessionDuration)}
              </Text>
            ) : (
              <Text fontSize="12px">
                Listened to{" "}
                {data.item.track.type == "episode" ? "episode" : "song"}
              </Text>
            )}
          </Box>
        </Stack>
      </HStack>
    </Stack>
  );
});