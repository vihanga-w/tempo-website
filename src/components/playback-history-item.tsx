import { Avatar, Box, Flex, Image, Text, Button, Icon } from "@chakra-ui/react";
import { MdAddReaction, MdExplicit } from "react-icons/md";
import ReactTimeAgo from "react-time-ago";
import { FriendListenershipItem } from "@/lib/usrlib";

function formatTime(ms: number) {
  if (ms < 0) ms = 0;
  const seconds = ms / 1e3;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

function getSpotifyDeeplink(trackId: string) {
  return `spotify://track/${trackId}`;
}

function timestampToParsedTime(timestamp: number) {
  const time = new Date(timestamp).toLocaleTimeString().slice(0, 5);
  return time.endsWith(":") ? `0${time.slice(0, 4)}` : time;
}

export function PlaybackHistoryItem({
  data,
}: {
  data: FriendListenershipItem;
}) {
  return (
    <Flex
      direction="column"
      p="3"
      borderWidth="1px"
      borderRadius="md"
      gap="2"
      bg="gray.50"
    >
      {/* Header: User info and reaction icon */}
      <Flex align="center" justify="space-between">
        <Flex align="center" gap="2">
          {data.pfpUrl ? (
            <Image
              src={data.pfpUrl}
              boxSize="36px"
              borderRadius="md"
              objectFit="cover"
              draggable={false}
            />
          ) : (
            <Avatar
              name={data.username + data.userId}
              boxSize="36px"
              borderRadius="md"
            />
          )}
          <Box>
            <Text fontSize="sm" fontWeight="bold" isTruncated>
              {data.username}
            </Text>
            <Text fontSize="xs" color="gray.500">
              {new Date().getTime() - data.timestamp <= 3600e3 * 12 ? (
                <ReactTimeAgo date={data.timestamp} locale="en-GB" />
              ) : (
                `${new Date(data.timestamp).toLocaleDateString("en-GB")} ${timestampToParsedTime(
                  data.timestamp
                )}`
              )}
            </Text>
          </Box>
        </Flex>
        <Icon as={MdAddReaction} opacity="0.45" boxSize="5" />
      </Flex>

      {/* Body: Song details */}
      <Flex align="center" gap="3">
        <Image
          src={data.item.track.album.artUrl}
          boxSize="60px"
          borderRadius="md"
          objectFit="cover"
          draggable={false}
        />
        <Box flex="1">
          <Flex align="center" justify="space-between">
            <Text fontSize="sm" fontWeight="semibold" isTruncated>
              {data.item.track.name}
            </Text>
            {data.item.track.explicit && <Icon as={MdExplicit} boxSize="4" />}
          </Flex>
          <Text fontSize="xs" color="gray.600" isTruncated>
            {data.item.track.artists.map(v => v.name).join(", ")}
          </Text>
          <Flex align="center" justify="space-between" mt="1">
            <Text fontSize="xs" color="gray.600">
              {data.item.replayed
                ? "Replayed"
                : data.item.sessionDuration !== 1
                ? `Listened for ${formatTime(
                    data.item.track.duration * data.item.sessionDuration
                  )}`
                : "Listened to song"}
            </Text>
            <Button
              variant="link"
              size="xs"
              onClick={() => window.open(getSpotifyDeeplink(data.item.track.id))}
            >
              Play on Spotify
            </Button>
          </Flex>
        </Box>
      </Flex>
    </Flex>
  );
}
