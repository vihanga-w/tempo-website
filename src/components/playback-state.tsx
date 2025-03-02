import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import { Box, HStack, Image, Stack, Text}  from "@chakra-ui/react"
import { MdAddReaction, MdExplicit } from "react-icons/md";
import { useEffect, useState } from "react";

function formatTime(ms: number) {
    const seconds = ms / 1e3;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatTimeToMin(ms: number) {
    const seconds = ms / 1e3;
    const minutes = Math.round(seconds / 60);

    return `${minutes} minutes`;
}

function getSpotifyDeeplink(trackId: string) {
    return `spotify://track/${trackId}`;
}

export function PlaybackState({
    stream,
    userId,
}: {
    stream: DataStreamer | null,
    userId: string,
}) {
    const [data, setData] = useState<UpdateEvent["data"]>();
    const [progress, setProgress] = useState(data?.interpolatedProgress ?? data?.state?.progressNormal ?? 0);
    const [replayCountVisible, setReplayCountVisible] = useState<boolean>(false);
    const [replayCount, setReplayCount] = useState<number>(0);
    const [userListenershipFact, setUserListenershipFact] = useState<string>("");

    useEffect(() => {
        if (!stream)
            return;

        const updateState = (data: UpdateEvent) => {
            setData(data.data);
            setProgress(data.data.interpolatedProgress ?? data.data.state?.progressNormal ?? 0);
        }

        stream.on("update-" + userId, (data: UpdateEvent) => {
            updateState(data);

            // Process song stats for the day and generate facts
            const stats = data.data.state?.todayStats;

            if (!stats)
                return;

            const factPool: string[] = [];

            if (stats.completeListenCount >= 5)
                factPool.push("has listened to " + stats.completeListenCount + " times");

            if (stats.totalSessionDuration >= 4 && data.data.state?.duration)
                factPool.push("spent " + formatTimeToMin(stats.totalSessionDuration * data.data.state?.duration) + " listening to");

            if (factPool.length == 0) {
                setUserListenershipFact("");
            } else {
                const electedFact = factPool[Math.floor(Math.random() * factPool.length)];

                setUserListenershipFact(electedFact);
            }
        });

        const prevState = stream.getPrevState(userId);

        if (prevState)
            updateState(prevState);
    }, [stream]);

    useEffect(() => {
        if (!data?.state?.replayCount)
            return;

        const count = data?.state?.replayCount;

        // Dont update the count though
        // We dont want it to appear to tick down as it fades away
        if (count == 0) {
            setReplayCountVisible(false);

            return;
        }

        if (count > 0) {
            setReplayCount(count);
        }
    }, [data?.state?.replayCount]);

    // Wait for count to update to make sure it is at the correct value when we make it visible
    useEffect(() => {
        if (replayCount > 0)
            setReplayCountVisible(true);
    }, [replayCount]);

    return (<>
        <Stack gap="8px">
            <HStack justifyContent="space-between">
                <HStack>
                    {data?.state?.pfpUrl !== "" && (
                        <Image width="24px" borderRadius="6px" src={data?.state?.pfpUrl} />
                    )}
                    <Text fontSize="18px" fontWeight="bold">{data?.state?.username}</Text>
                    <>
                        {(data?.state && replayCountVisible) && (
                            <Text>
                                replayed x{replayCount}
                            </Text>
                        )}
                        {(data?.state && (userListenershipFact !== "" && !replayCountVisible)) && (
                            <Text>
                                {userListenershipFact}
                            </Text>
                        )}
                    </>
                </HStack>
                <MdAddReaction opacity="0.45" size="22px" />
            </HStack>
            <HStack alignItems="self-start" width="100%">
                <Image width="64px" height="64px" background="rgba(255, 255, 255, 0.2)" borderRadius="6px" src={data?.state?.imageUrl} />
                <Stack height="100%" width="100%" gap="0" fontFamily="arial, helvetica" lineHeight="18px">
                    <HStack pos="relative" gap="5px" justifyContent="space-between">
                        <HStack width="100%" gap="5px">
                            {/* TODO: Make this text scroll with a fixed width */}
                            <Text maxWidth="175px" textOverflow="ellipsis" whiteSpace="nowrap" overflow="hidden">{data?.state?.name}</Text>
                            {data?.state?.explicit && (
                                <MdExplicit />
                            )}
                        </HStack>
                        <HStack pos="absolute" top="0" right="0" gap="5px" onClick={() => {
                            if (data?.state?.songId)
                                window.open(getSpotifyDeeplink(data.state?.songId));
                        }}>
                            <Box>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,256,256" width="26px" height="26px" fill-rule="nonzero"><g fill="#cccccc" fill-rule="nonzero" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-dasharray="" stroke-dashoffset="0" font-family="none" font-weight="none" font-size="none" text-anchor="none"><g transform="scale(5.12,5.12)"><path d="M25.009,1.982c-12.687,0 -23.009,10.322 -23.009,23.009c0,12.687 10.322,23.009 23.009,23.009c12.687,0 23.009,-10.321 23.009,-23.009c0,-12.688 -10.322,-23.009 -23.009,-23.009zM34.748,35.333c-0.289,0.434 -0.765,0.668 -1.25,0.668c-0.286,0 -0.575,-0.081 -0.831,-0.252c-2.473,-1.649 -6.667,-2.749 -10.167,-2.748c-3.714,0.002 -6.498,0.914 -6.526,0.923c-0.784,0.266 -1.635,-0.162 -1.897,-0.948c-0.262,-0.786 0.163,-1.636 0.949,-1.897c0.132,-0.044 3.279,-1.075 7.474,-1.077c3.5,-0.002 8.368,0.942 11.832,3.251c0.69,0.46 0.876,1.391 0.416,2.08zM37.74,29.193c-0.325,0.522 -0.886,0.809 -1.459,0.809c-0.31,0 -0.624,-0.083 -0.906,-0.26c-4.484,-2.794 -9.092,-3.385 -13.062,-3.35c-4.482,0.04 -8.066,0.895 -8.127,0.913c-0.907,0.258 -1.861,-0.272 -2.12,-1.183c-0.259,-0.913 0.272,-1.862 1.184,-2.12c0.277,-0.079 3.854,-0.959 8.751,-1c4.465,-0.037 10.029,0.61 15.191,3.826c0.803,0.5 1.05,1.56 0.548,2.365zM40.725,22.013c-0.373,0.634 -1.041,0.987 -1.727,0.987c-0.344,0 -0.692,-0.089 -1.011,-0.275c-5.226,-3.068 -11.58,-3.719 -15.99,-3.725c-0.021,0 -0.042,0 -0.063,0c-5.333,0 -9.44,0.938 -9.481,0.948c-1.078,0.247 -2.151,-0.419 -2.401,-1.495c-0.25,-1.075 0.417,-2.149 1.492,-2.4c0.185,-0.043 4.573,-1.053 10.39,-1.053c0.023,0 0.046,0 0.069,0c4.905,0.007 12.011,0.753 18.01,4.275c0.952,0.56 1.271,1.786 0.712,2.738z"></path></g></g></svg>
                            </Box>
                            <Box fontSize="12px" lineHeight="15px">
                                <Text>Play on</Text>
                                <Text>Spotify</Text>
                            </Box>
                        </HStack>
                    </HStack>
                    <Text maxWidth="180px" textOverflow="ellipsis" whiteSpace="nowrap" overflow="hidden">{data?.state?.artists.map(v => {
                        return v.name
                    }).join(", ")}</Text>
                    {data?.state && (
                        <HStack justifyContent="space-between" marginTop="10px">
                            <Text>{progress < 1 && data ? formatTime(data.state.duration * progress) : formatTime(data?.state.duration ?? 0)}</Text>
                            <Text>{progress < 1 && data ? formatTime(data.state.duration) : formatTime(data?.state.duration ?? 0)}</Text>
                        </HStack>
                    )}
                </Stack>
            </HStack>
            <Box
                width="100%"
                height="4px"
                background="rgba(255, 255, 255, 0.25)"
                borderRadius="8px"
            >
                {/* Playback progress bar */}
                <Box
                    width={`${Math.min(progress * 100, 100)}%`}
                    height="100%"
                    background="white"
                    borderRadius="8px"
                    transition="0.5s"
                />
            </Box>
        </Stack>
    </>);
}