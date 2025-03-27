import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import User from "@/lib/usrlib";
import { HStack, Stack, Box, Image, Text, Avatar } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import ReactTimeAgo from "react-time-ago";
import { PlaybackState } from "./playback-state";

export default function ProfilePage({
    user,
    pageChanger,
    admin,
}: Readonly<{
    user: User;
    pageChanger: (id: string, prevPage?: string) => void;
    admin?: boolean;
}>) {
    const [pfpLoadFailed, setPfpLoadFailed] = useState(false);
    const [playbackStateLoading, setPlaybackStateLoading] = useState(true);
    const [streamer, setStreamer] = useState<DataStreamer | null>(null);
    const [streamerReset, setStreamerReset] = useState<boolean>(false);
    const [playbackState, setPlaybackState] = useState<UpdateEvent | null>(null);

    const lastActive = new Date().getTime();

    useEffect(() => {
        const newStreamer = new DataStreamer(user.storedToken, [user.id]);
        
        setStreamer(newStreamer);

        newStreamer.on("update", (data: UpdateEvent) => {
            setPlaybackStateLoading(false);

            setPlaybackState((v) => {
                if (v && data.data.action.type == "STOPPED") {
                    return null;
                } else if (!v && data.data.action.type !== "STOPPED") {
                    return data;
                }
                
                return v;
            });
        });

        newStreamer.on("remove", (userId) => {
            if (userId === user.id) 
                setPlaybackState(null);
        });

        newStreamer.on("close", () => {
            // no-op, state will update once connection re-established
        });

        newStreamer.init();

        return () => {
            newStreamer.cleanup();
        };
    }, [user.isLoggedIn]);

    useEffect(() => {
        const handleFocus = async () => {
            if (streamer && !streamer.isReady()) {
                setPlaybackStateLoading(true);
                setPlaybackState(null);
                setStreamerReset(true);
            }
        };

        window.addEventListener("focus", handleFocus);
        return () => {
            window.removeEventListener("focus", handleFocus);
        };
    }, [streamer]);
    
    useEffect(() => {
        if (streamerReset && streamer && playbackState) {
            streamer.cleanup();
            streamer.init();
            setStreamerReset(false);
        }
    }, [playbackState, streamer, streamerReset]);

    return (<>
        <Stack gap="26px" width="100%">
            <HStack gap="24px" marginTop="24px">
                {((user?.object?.images.length ?? 0) > 0 && !pfpLoadFailed) ? (
                    <Image
                        width="82px"
                        height="82px"
                        objectFit="cover"
                        borderRadius="12px"
                        // We are using the first image for now, need to write a method to use most optimal image
                        src={user?.object?.images[0]?.url}
                        draggable={false}
                        onError={() => {
                            setPfpLoadFailed(true);
                        }}
                    />
                ) : (
                    <Avatar
                        // Append user id so that different users potentially with same name has different bg colours
                        name={user.object?.displayName ?? "" + user.object?.id ?? ""}
                        borderRadius="12px"
                        width="82px"
                        height="82px"
                    />
                )}
                <Stack gap="0">
                    <Text
                        fontFamily="Inter"
                        fontWeight="medium"
                        fontSize="28px"
                        color="text.dark"
                        opacity="0.9"
                        onClick={() => {
                            pageChanger("edit-profile", "settings");
                        }}
                    >
                        {user.object?.displayName}
                    </Text>
                    <Text
                        fontFamily="Inter"
                        fontWeight="regular"
                        fontSize="14px"
                        color="text.dark"
                        opacity="0.75"
                        marginTop="-4px"
                        onClick={() => {
                            pageChanger("edit-profile", "settings");
                        }}
                    >
                        Last active{" "}
                        {new Date().getTime() - lastActive <= 3600e3 * 12 ? (
                            <ReactTimeAgo date={lastActive} locale="en-GB" />
                        ) : (
                            new Date(lastActive).toLocaleDateString("en-GB")
                        )}
                    </Text>
                    <Text
                        fontFamily="Inter"
                        fontWeight="regular"
                        fontSize="14px"
                        color="skyblue"
                        opacity="0.75"
                        onClick={() => {
                            window.location.pathname = "/success";
                        }}
                    >
                        Play with Card
                    </Text>
                </Stack>
            </HStack>
            {playbackState && (
                <Stack gap="1px">
                    <Text
                        fontFamily="Inter"
                        fontWeight="bold"
                        fontSize="24px"
                        color="text.dark"
                    >Listening to</Text>
                    <PlaybackState
                        stream={streamer}
                        userId={user.id}
                        hideProfile
                    />
                </Stack>
            )}
        </Stack>
    </>);
}