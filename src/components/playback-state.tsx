import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import { Avatar, Box, HStack, Image, Skeleton, SkeletonText, Stack, Text}  from "@chakra-ui/react"
import { MdAddReaction, MdExplicit } from "react-icons/md";
import { ReactEventHandler, useEffect, useState } from "react";
import { keyframes } from "@emotion/react";
import { getSizedImageUrl } from "@/lib/sized-img";

function formatTime(ms: number) {
    if (ms < 0)
        ms = 0;

    const seconds = ms / 1e3;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

export function formatTimeToMinAndHour(ms: number, fullText?: boolean) {
    if (ms < 0)
        ms = 0;

    const seconds = ms / 1e3;
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);

    if (minutes < 60)
        return `${minutes}${fullText ? " minute" : "m"}${minutes !== 1 && fullText ? "s" : ""}`;
    else if (minutes == 60)
        return (!fullText ? "1hr" : "1 hour");
    else if (mins == 0)
        return `${hours}${fullText ? " hour" : "hr"}${hours !== 1 && fullText ? "s" : ""}`;
    else
        return `${hours}${fullText ? " hour" : "hr"}${hours !== 1 && fullText ? "s" : ""} ${mins}${fullText ? " minute" : "m"}${mins !== 1 && fullText ? "s" : ""}`;
}

export function getSpotifyDeeplink(trackId: string) {
    return `spotify://track/${trackId}`;
}

const scrollText = keyframes`
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
`;

export const SkeletonImage = ({
    src,
    onError,
    width,
    height,
    borderRadius,
    transition,
    border,
    loading,
}: {
    src: string;
    onError?: ReactEventHandler<HTMLImageElement>;
    width: string;
    height: string;
    borderRadius: string;
    transition?: string;
    border?: string;
    loading?: "eager" | "lazy" | undefined;
}) => {
    const [isLoaded, setIsLoaded] = useState<boolean>(false);

    return (<Box pos="relative" height={height} minHeight={height} width={width} minWidth={width}>
        <Skeleton pos="absolute" height={height} width={width} borderRadius={borderRadius} />
        <Image
            pos="absolute"
            width={width}
            minWidth={width}
            height={height}
            minHeight={height}
            objectFit="cover"
            borderRadius={borderRadius}
            transition={transition}
            border={border}
            src={src}
            draggable={false}
            loading={loading}
            onError={(e) => {
                if (src == "null")
                    return;

                if (onError)
                    onError(e);
            }}
            opacity={isLoaded ? 1 : 0}
            onLoad={() => {
                setIsLoaded(true);
            }}
        />
    </Box>);
}

export function PlaybackState({
    stream,
    userId,
    hideProfile,
    hideReaction,
    hideSpotifyCallout,
    theme,
    profileClickCb,
    reactionClickCb,
    isPlaceholder
}: {
    stream: DataStreamer | null,
    userId: string,
    hideProfile?: boolean,
    hideReaction?: boolean,
    hideSpotifyCallout?: boolean,
    theme?: string,
    profileClickCb?: () => void;
    reactionClickCb?: (data: UpdateEvent["data"]["state"]) => void;
    isPlaceholder?: boolean;
}) {
    const [data, setData] = useState<UpdateEvent["data"] | undefined>(stream?.getPrevState(userId)?.data);
    const [progress, setProgress] = useState(data?.interpolatedProgress ?? data?.state?.progressNormal ?? 0);
    const [userListenershipFact, setUserListenershipFact] = useState<{
        sid: string;
        text: string
    }>({
        sid: "",
        text: "Started listening recently",
    });
    const [pfpLoadFailed, setPfpLoadFailed] = useState<boolean>(false);
    const [userListenershipFactVisible, setUserListenershipFactVisible] = useState<boolean>(false);

    if (!isPlaceholder) {
        useEffect(() => {
            if (!stream)
                return;

            const updateState = (data: UpdateEvent) => {
                setData(data.data);
                setProgress(data.data.interpolatedProgress ?? data.data.state?.progressNormal ?? 0);

                let makeULFV = false;

                // Nothing playing, so there is nothing to say about it
                if (!data.data.state) {
                    setUserListenershipFactVisible(false);

                    return;
                }

                // Process song stats for the day and generate facts
                //
                // Missing stats used to end the whole function, which left the
                // line hidden and its visibility never updated — so a track with
                // no stats yet showed a blank gap under the name. They are just
                // one source of facts among several, and their absence only means
                // this pool is empty.
                const stats = data.data.state?.todayStats;

                const factPool: string[] = [];

                if (stats && stats.completeListenCount >= 5)
                    factPool.push("Listened to song " + stats.completeListenCount + " times");

                if (stats && stats.totalSessionDuration >= 4 && data.data.state?.duration)
                    factPool.push("Spent " + formatTimeToMinAndHour(stats.totalSessionDuration * data.data.state?.duration) + " listening to song");

                if (data.data.state?.replayCount && data.data.state?.replayCount > 0) {
                    setUserListenershipFact({
                        sid: data.data.state.songId,
                        text: `Replayed x${data.data.state?.replayCount}`,
                    });

                    makeULFV = true;
                } else if (!data.data.state?.isPlaying) {
                    setUserListenershipFact({
                        sid: data.data.state?.songId ?? "",
                        text: "Paused"
                    });

                    makeULFV = true;
                } else if (factPool.length > 0) {
                    const electedFact = factPool[Math.floor((data.data.state?.displaySeed ?? 0) * factPool.length)];

                    setUserListenershipFact({
                        sid: data.data.state?.songId ?? "",
                        text: electedFact
                    });

                    makeULFV = true;
                // (playbackState?.data.state?.playSessionStart && playbackState?.data.state?.playSessionStart !== -1 && new Date().getTime() - playbackState.data.state.playSessionStart >= (60e3 * 5))
                } else if (data.data.state.playSessionStart !== -1 && new Date().getTime() - data.data.state.playSessionStart >= (60e3 * 5)) {
                    setUserListenershipFact({
                        sid: data.data.state?.songId ?? "",
                        text: `🔥 ${formatTimeToMinAndHour(new Date().getTime() - data.data.state.playSessionStart, true)}`,
                    });

                    makeULFV = true;
                } else {
                    // Something is playing and nothing above had anything to say
                    // about it — including a session with no start time recorded,
                    // which previously matched no branch at all and left the line
                    // blank rather than falling through to here.
                    setUserListenershipFact({
                        sid: data.data.state?.songId ?? "",
                        text: "Started listening recently",
                    });

                    makeULFV = true;
                }

                setUserListenershipFactVisible(makeULFV);
            }

            stream.on("update-" + userId, (data: UpdateEvent) => {
                updateState(data);
            });

            const prevState = stream.getPrevState(userId);

            if (prevState)
                updateState(prevState);
        }, [stream]);
    }

    return (<>
        {data?.action.type !== "STOPPED" && (<>
            <Stack gap="8px" maxHeight={hideProfile ? "84px" : "135px"} height={hideProfile ? "84px" : "135px"}>
                {!hideProfile && (
                    <HStack justifyContent="space-between">
                        <HStack onClick={profileClickCb}>
                            {isPlaceholder ? (
                                <SkeletonImage
                                    width="36px"
                                    height="36px"
                                    borderRadius="6px"
                                    src={"null"}
                                    onError={() => { }}
                                />
                            ) : data?.state?.pfpUrl !== "" && !pfpLoadFailed ? (
                                <SkeletonImage
                                    width="36px"
                                    height="36px"
                                    borderRadius="6px"
                                    src={getSizedImageUrl(data?.state?.pfpUrl ?? "null", 36, 36)}
                                    key={data?.state?.pfpUrl ?? "null"}
                                    onError={() => {
                                        setPfpLoadFailed(true);
                                    }}
                                />
                            ) : (
                                <Avatar
                                    // Append user id so that different users potentially with same name has different bg colours
                                    name={data?.state?.username ?? "" + data?.state?.userId ?? ""}
                                    borderRadius="6px"
                                    width="36px"
                                    height="36px"
                                />
                            )}
                            <Stack spacing="0">
                                {!isPlaceholder && data?.state ? (<>
                                    <Text
                                        fontSize="16px"
                                        fontWeight="bold"
                                        marginBottom="-5px"
                                        height="24px"
                                    >{data?.state?.username}</Text>
                                    <Text
                                        opacity={userListenershipFactVisible ? "1" : "0"}
                                        transform={userListenershipFactVisible ? "translateX(0)" : "translateX(-6px)"}
                                        transition="opacity 0.5s, transform 0.5s"
                                        whiteSpace="nowrap"
                                        overflow="hidden"
                                        textOverflow="ellipsis"
                                        color="#b4b4b4"
                                        fontSize="16px"
                                        height="24px"
                                    >
                                        {userListenershipFact.text}
                                    </Text>
                                </>) : (<Stack gap="4px">
                                    <Skeleton height="14px" width="80px" borderRadius="2px" />
                                    <Skeleton height="14px" width="245px" borderRadius="2px" />
                                </Stack>)}
                            </Stack>
                        </HStack>
                        {!hideReaction && (<MdAddReaction opacity="0.45" size="22px" onClick={() => {
                            if (reactionClickCb)
                                reactionClickCb(data?.state);
                        }} />)}
                    </HStack>
                )}
                <HStack alignItems="self-start" width="100%">
                    <Box minW="72px" pos="relative">
                        {data?.state?.mediaType == "episode" && (
                            <Image
                                width="24px"
                                height="24px"
                                pos="absolute"
                                top="4px"
                                left="4px"
                                src="/podcast-icon.svg"
                            />
                        )}
                        {!isPlaceholder ? (
                            <SkeletonImage
                                width="72px"
                                height="72px"
                                borderRadius="8px"
                                src={getSizedImageUrl(data?.state?.imageUrl ?? "", 72, 72)}
                                key={data?.state?.imageUrl ?? ""}
                                onError={() => {}}
                            />
                        ) : (
                            <SkeletonImage
                                width="72px"
                                height="72px"
                                borderRadius="8px"
                                src={"null"}
                                key={"null"}
                                onError={() => {}}
                            />
                        )}
                    </Box>
                    {!isPlaceholder && data?.state ? (<>
                        <Stack height="72px" width="100%" gap="0" fontFamily="arial, helvetica" lineHeight="18px">
                            <HStack pos="relative" gap="5px" justifyContent="space-between">
                                <HStack width="100%" gap="5px">
                                    {/* TODO: Make this text scroll with a fixed width */}
                                    <Text maxWidth="175px" textOverflow="ellipsis" whiteSpace="nowrap" overflow="hidden">{data?.state?.name}</Text>
                                    {data?.state?.explicit && (
                                        <MdExplicit />
                                    )}
                                </HStack>
                                {!hideSpotifyCallout && (
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
                                )}
                            </HStack>
                            <Text maxWidth="180px" textOverflow="ellipsis" whiteSpace="nowrap" overflow="hidden">{data?.state?.artists ? data?.state?.artists.map(v => {
                                return v.name
                            }).join(", ") : ""}</Text>
                            <HStack justifyContent="space-between" marginTop="16px">
                                <Text>{progress < 1 && data ? formatTime(data.state.duration * progress) : formatTime(data?.state.duration ?? 0)}</Text>
                                <Text>{progress < 1 && data ? formatTime(data.state.duration) : formatTime(data?.state.duration ?? 0)}</Text>
                            </HStack>
                        </Stack>
                    </>) : (<>
                        <Stack width="100%" height="72px" gap="4px">
                            <Skeleton height="14px" width="175px" borderRadius="2px" />
                            <Skeleton height="14px" width="80px" borderRadius="2px" />
                            <HStack justifyContent="space-between" marginTop="16px">
                                <Skeleton height="14px" width="24px" borderRadius="2px" />
                                <Skeleton height="14px" width="24px" borderRadius="2px" />
                            </HStack>
                        </Stack>
                    </>)}
                </HStack>
                {!isPlaceholder && data?.state ? (<Box
                    width="100%"
                    height="4px"
                    background="rgba(255, 255, 255, 0.25)"
                    borderRadius="8px"
                >
                    {/* Playback progress bar */}
                    <Box
                        width={`${Math.min(progress * 100, 100)}%`}
                        height="100%"
                        background={theme ?? "white"}
                        borderRadius="8px"
                        transition="0.5s"
                    />
                </Box>) : (<Skeleton width="100%" height="4px" borderRadius="8px" />)}
            </Stack>
        </>)}
    </>);
}