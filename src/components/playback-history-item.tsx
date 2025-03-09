import { Avatar, Flex, Image, Text, Button, Icon } from "@chakra-ui/react";
import { MdExplicit } from "react-icons/md";
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

export function PlaybackHistoryItem({
  data,
}: {
  data: FriendListenershipItem;
}) {
  return (
    <Flex direction="row" align="center" p="2">
      {/* User avatar */}
      {data.pfpUrl ? (
        <Image
          src={data.pfpUrl}
          boxSize="30px"
          borderRadius="md"
          objectFit="cover"
          draggable={false}
        />
      ) : (
        <Avatar name={data.username + data.userId} boxSize="30px" />
      )}

      <Flex direction="column" flex="1" ml="2">
        {/* Username */}
        <Text fontSize="sm" fontWeight="bold" noOfLines={1}>
          {data.username}
        </Text>

        <Flex align="center" mt="1">
          {/* Album art */}
          <Image
            src={data.item.track.album.artUrl}
            boxSize="50px"
            borderRadius="md"
            objectFit="cover"
            draggable={false}
          />

          <Flex direction="column" ml="2" flex="1">
            {/* Track name and explicit marker */}
            <Flex align="center">
              <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
                {data.item.track.name}
              </Text>
              {data.item.track.explicit && (
                <Icon as={MdExplicit} ml="1" boxSize="3" />
              )}
            </Flex>

            {/* Artist names */}
            <Text fontSize="xs" color="gray.600" noOfLines={1}>
              {data.item.track.artists.map(a => a.name).join(", ")}
            </Text>

            {/* Listening duration */}
            <Text fontSize="xs" mt="1">
              {data.item.replayed
                ? "Replayed"
                : data.item.sessionDuration !== 1
                ? `Listened for ${formatTime(
                    data.item.track.duration * data.item.sessionDuration
                  )}`
                : "Listened to song"}
            </Text>
          </Flex>

          {/* Spotify deeplink */}
          <Button
            variant="link"
            fontSize="xs"
            ml="2"
            onClick={() => window.open(getSpotifyDeeplink(data.item.track.id))}
          >
            Play
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}
