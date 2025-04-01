import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import User, { ClientUserAccount } from "@/lib/usrlib";
import { HStack, Stack, Box, Image, Text, Avatar, Tabs, TabList, Tab, TabPanels, TabPanel, Center, Spinner } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import ReactTimeAgo from "react-time-ago";
import { getSpotifyDeeplink, PlaybackState } from "./playback-state";
import { FastAverageColor } from 'fast-average-color';
import { apcach, crToBg } from "apcach";
import { oklch, formatHex } from 'culori';
import LeaderboardSongItem from "./leaderboard-song-item";
import { MdExplicit } from "react-icons/md";

const loadTracker = (expectedCount: number, onComplete: () => void) => {
    let count = 0;
    let executed = false;
    let loadedIds: string[] = [];

    return (id: string) => {
        if (loadedIds.includes(id))
            return;

        loadedIds.push(id);

        count += 1;

        if (count >= expectedCount && !executed) {
            executed = true;
            onComplete();
        }
    }
}

export default function ProfilePage({
    user,
    targetUserId,
    pageChanger,
    admin,
    hideTopGradientCb,
    setComplementaryColour,
}: Readonly<{
    user: User;
    targetUserId?: string;
    pageChanger: (id: string, prevPage?: string) => void;
    admin?: boolean;
    hideTopGradientCb: (hide: boolean) => void;
    setComplementaryColour: (hex: string) => void;
}>) {
    const [profileData, setProfileData] = useState<ClientUserAccount | undefined>(user.object);
    const [pfpLoadFailed, setPfpLoadFailed] = useState(false);
    const [streamer, setStreamer] = useState<DataStreamer | null>(null);
    const [streamerReset, setStreamerReset] = useState<boolean>(false);
    const [playbackState, setPlaybackState] = useState<UpdateEvent | null>(null);
    const [reactiveDesignColour, setReactiveDesignColour] = useState<string | null>(null);
    const [reactiveDesignColourCommited, setReactiveDesignColourCommited] = useState<string | null>(null);
    const [displayReactiveDesignColour, setDisplayReactiveDesignColour] = useState<boolean>(false);
    const [reactiveDesignComplementaryColour, setReactiveDesignComplementaryColour] = useState<string | null>(null);
    const [topSongsFilter, setTopSongsFilter] = useState<"day" | "week" | "month" | "year" | "all">("day");
    const [userTopSongs, setUserTopSongs] = useState<{
        id: string;
        title: string;
        artists: string[];
        index: number;
        explicit: boolean;
        playCount: number;
        imageUrl: string;
    }[]>([]);
    const [topSongOverflow, setTopSongOverflow] = useState<number>(-1);
    const [topSongsLoading, setTopSongsLoading] = useState<boolean>(true);
    const [pageLoaded, setPageLoaded] = useState<boolean>(false);

    const scrollItemRef = useRef<HTMLDivElement>(null);

    const lastActive = new Date().getTime();

    const setStatusBarColour = (colour: string) => {
        const themeColour = document.querySelector("meta[name=theme-color]");
        themeColour?.setAttribute("content", colour);
    }

    useEffect(() => {
        if (!targetUserId)
            return;

        setProfileData(undefined);
    }, [])

    useEffect(() => {
        if (!scrollItemRef.current)
            return;

        if (scrollItemRef.current.getBoundingClientRect().width <= window.innerWidth - 125)
            return;

        const process = () => {
            if (scrollItemRef.current && topSongOverflow <= 0)
                setTopSongOverflow(scrollItemRef.current.getBoundingClientRect().width - (window.innerWidth - 165));
            else
                setTopSongOverflow(0);
        }

        if (topSongOverflow == -1)
            setTimeout(() => { process() }, 2500);

        setTimeout(() => { process() }, 10e3);
    }, [scrollItemRef, topSongOverflow]);

    useEffect(() => {
        setTopSongsLoading(true);

        setTimeout(() => {
            // Load user's top songs
            user.getRemoteUserTopSongs(targetUserId ?? user.id, topSongsFilter)
            .then(data => {
                setUserTopSongs(data.slice(0, 5));
                setTopSongsLoading(false);
            })
            .catch(e => {
                console.error("Failed to load top songs, error:", e);
                
                setUserTopSongs([]);
                setTopSongsLoading(false);
            });
        }, 75);
    }, [topSongsFilter]);

    useEffect(() => {
        const loadCb = loadTracker(3, () => {
            setTimeout(() => {
                setPageLoaded(true);
            }, 100);
        });

        user.getRemoteUser(targetUserId ?? user.id)
        .then(r => {
            setProfileData(r);
            loadCb("remote-user-profile");
        })
        .catch(e => {
            console.error("Failed to get remote user for", targetUserId ?? user.id, " error:", e);
            loadCb("remote-user-profile");
        });

        const fac = new FastAverageColor();

        let streamerGotMsg = false;

        if (user?.object && user.object.images.length > 0) {
            fac.getColorAsync(user?.object?.images[0]?.url)
            .then(color => {
                if (streamerGotMsg)
                    return;
                
                setReactiveDesignColour(color.rgb);
                hideTopGradientCb(true);
            })
            .catch(e => {
                console.log(e);
            });
        }

        const newStreamer = new DataStreamer(user.storedToken, [targetUserId ?? user.id]);
        
        setStreamer(newStreamer);

        newStreamer.on("not-listening", (userIds: string[]) => {
            loadCb("top-grad");
        });

        newStreamer.on("update", (data: UpdateEvent) => {
            setPlaybackState((v) => {
                if (data.data.state) {
                    streamerGotMsg = true;

                    const fac = new FastAverageColor();
                    
                    fac.getColorAsync(data.data.state.imageUrl)
                    .then(color => {
                        setReactiveDesignColour(color.rgb);
                        hideTopGradientCb(true);
                        loadCb("top-grad");
                    })
                    .catch(e => {
                        console.log(e);
                    });
                }

                if (data.data.action.type == "STOPPED") {
                    setReactiveDesignColour(null);

                    return null;
                }
                
                return data;
            });
        });

        newStreamer.on("remove", (userId) => {
            if (userId === (targetUserId ?? user.id)) {
                setPlaybackState(null);
                setReactiveDesignColour(null);
            }
        });

        newStreamer.on("close", () => {
            // no-op, state will update once connection re-established
        });

        newStreamer.on("open", () => {
            loadCb("remote-user-stream");
        });

        newStreamer.init();

        return () => {
            newStreamer.cleanup();
        };
    }, [user.isLoggedIn]);

    useEffect(() => {
        if (reactiveDesignColour) {
            setStatusBarColour("#0d0d0e");
            setDisplayReactiveDesignColour(false);

            setTimeout(() => {
                setReactiveDesignColourCommited(reactiveDesignColour);
            }, 230);
            setTimeout(() => {
                setDisplayReactiveDesignColour(true);
            }, 250);
        } else {
            setReactiveDesignColourCommited(reactiveDesignColour);
            setTimeout(() => {
                setDisplayReactiveDesignColour(true);
            }, 20);
        }
    }, [reactiveDesignColour]);

    useEffect(() => {
        hideTopGradientCb(reactiveDesignColour !== null);
    }, [reactiveDesignColour]);

    useEffect(() => {
        if (reactiveDesignColourCommited) {
            const rgbValues = reactiveDesignColourCommited
                .match(/\d+/g)
                ?.map(Number);
            
            if (!rgbValues)
                return;
            
            const hex = rgbToHex(
                0.5 * rgbValues[0] + (1 - 0.5) * 13,
                0.5 * rgbValues[1] + (1 - 0.5) * 13,
                0.5 * rgbValues[2] + (1 - 0.5) * 14
            );
            
            setStatusBarColour(hex);
        } else {
            setStatusBarColour("#0d0d0e");
        }
    }, [reactiveDesignColourCommited]);

    useEffect(() => {
        const handleFocus = async () => {
            if (streamer && !streamer.isReady()) {
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

    function componentToHex(c: number) {
        var hex = Math.ceil(Math.min(c, 255)).toString(16);

        return hex.length == 1 ? "0" + hex : hex;
    }
    
    function rgbToHex(r: number, g: number, b: number) {
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }

    function hexToRgb(hex: string) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    useEffect(() => {
        if (reactiveDesignColourCommited) {
            // Convert "rgb(r, g, b)" to an array of numbers [r, g, b]
            const rgbValues = reactiveDesignColourCommited
                .match(/\d+/g)
                ?.map(Number);

            if (rgbValues && rgbValues.length === 3) {
                const [r, g, b] = rgbValues;
                let hex = rgbToHex(r, g, b);

                // Check if the color is a shade of white (r, g, b values close to each other and above 100)
                const isShadeOfWhite = Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15 && r > 100 && g > 100 && b > 100;
                
                if (isShadeOfWhite) {
                    setReactiveDesignComplementaryColour("#ffffff");
                    setComplementaryColour("#ffffff");

                    return;
                }

                let colourMultiplier = 1;

                if (r > 175 && g > 175 && b > 175) {
                    colourMultiplier = 2.75;
                } else if (r < 80 && g < 80 && b < 80) {
                    colourMultiplier = 1.25;
                }

                const h = oklch(hex);

                const ideal = apcach(crToBg(hex, 60), h?.c ?? 0, h?.h ?? 0);
                
                const idealHexPre = formatHex(oklch({
                    mode: "oklch",
                    l: Math.max(ideal.lightness, 0.865),
                    c: ideal.chroma,
                    h: ideal.hue,
                }));

                const idealRgb = hexToRgb(idealHexPre);
                const idealHex = rgbToHex((idealRgb?.r ?? 0) * colourMultiplier, (idealRgb?.g ?? 0) * colourMultiplier, (idealRgb?.b ?? 0) * colourMultiplier);
                
                setReactiveDesignComplementaryColour(idealHex);
                setComplementaryColour(idealHex);
            }
        } else {
            setReactiveDesignComplementaryColour("#ffffff");
            setComplementaryColour("#ffffff");
        }
    }, [reactiveDesignColourCommited]);

    return (<>
        <Box
            display={pageLoaded ? "none" : "block"}
            width="100vw"
            height="100vh"
            background="bg.dark"
            pos="fixed"
            top="0"
            left="0"
            zIndex="999999"
        >
            <Center height="100vh">
                <Spinner size="lg" />
            </Center>
        </Box>
        <Box
            pos="fixed"
            left="0"
            top="0"
            zIndex="0"
            background={`linear-gradient(to bottom, ${reactiveDesignColourCommited ?? "#ffffff00"}, #ffffff00)`}
            opacity={displayReactiveDesignColour ? "0.5" : 0}
            transform={displayReactiveDesignColour ? "translateY(0px)" : "translateY(-100%)"}
            padding="24px"
            width="100vw"
            height="340px"
            transition=".75s"
        />
        <Box
            pos="fixed"
            left="0"
            top="0"
            zIndex="0"
            background={reactiveDesignColourCommited ?? "#ffffff00"}
            opacity={displayReactiveDesignColour ? "0.15" : 0}
            padding="24px"
            width="100vw"
            height="100vh"
            transition=".75s"
        />
        <Stack gap="26px" width="100%" pos="relative" zIndex="1" marginTop="-15px">
            <HStack gap="24px" marginTop="24px">
                {((user?.object?.images.length ?? 0) > 0 && !pfpLoadFailed) ? (
                    <Image
                        width="82px"
                        height="82px"
                        objectFit="cover"
                        borderRadius="12px"
                        // We are using the first image for now, need to write a method to use most optimal image
                        src={profileData?.images[0].url}
                        draggable={false}
                        onError={() => {
                            setPfpLoadFailed(true);
                        }}
                    />
                ) : (
                    <Avatar
                        // Append user id so that different users potentially with same name has different bg colours
                        name={profileData?.displayName ?? "" + profileData?.id ?? ""}
                        borderRadius="12px"
                        width="82px"
                        height="82px"
                    />
                )}
                <Stack gap="0" marginTop="-5px">
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
                    {profileData?.displayName}
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
                    {!targetUserId && (
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
                    )}
                </Stack>
            </HStack>
            <Stack gap="1px" opacity={playbackState ? "1" : "0"} height={playbackState ? "auto" : "0"} overflow="hidden" transition=".5s">
                <Text
                    fontFamily="Inter"
                    fontWeight="bold"
                    fontSize="24px"
                    color={reactiveDesignComplementaryColour ?? "text.dark"}
                    transition=".3s"
                >Listening to</Text>
                <PlaybackState
                    stream={streamer}
                    userId={targetUserId ?? user.id}
                    theme={reactiveDesignComplementaryColour ?? undefined}
                    hideProfile
                />
            </Stack>
            <Stack
                transition=".3s"
                opacity={userTopSongs.length > 0 && userTopSongs.find(v => v.index == 0) ? 1 : 0}
                height={userTopSongs.length > 0 && userTopSongs.find(v => v.index == 0) ? "auto" : 0}
                pos="relative"
            >
                <Box>
                    <Text
                        fontFamily="Inter"
                        fontWeight="bold"
                        fontSize="24px"
                        color={reactiveDesignComplementaryColour ?? "text.dark"}
                        transition=".3s"
                        float="left"
                    >
                        Top Songs
                    </Text>
                    <Tabs variant='unstyled' pointerEvents={topSongsLoading ? "none" : "all"} onChange={i => {
                        const map: ("day" | "week" | "month" | "year" | "all")[] = [
                            "day",
                            "week",
                            "month",
                        ];

                        setTopSongsFilter(map[i]);
                    }} float="right">
                        <TabList width="124px" height="36px" border="2px solid rgba(255, 255, 255, 0.1)" bg={reactiveDesignColourCommited?.replace("(", "a(").replace(")", ",0.25)") ?? "rgba(255, 255, 255, 0.01)"} borderRadius="14px">
                            <Tab width="40px" fontSize="14px" borderRadius="12px" _selected={{ color: reactiveDesignComplementaryColour ?? "white", bg: reactiveDesignColourCommited ?? "rgba(255, 255, 255, 0.01)" }}>24h</Tab>
                            <Tab width="40px" fontSize="14px" borderRadius="12px" _selected={{ color: reactiveDesignComplementaryColour ?? "white", bg: reactiveDesignColourCommited ?? "rgba(255, 255, 255, 0.01)" }}>7d</Tab>
                            <Tab width="40px" fontSize="14px" borderRadius="12px" _selected={{ color: reactiveDesignComplementaryColour ?? "white", bg: reactiveDesignColourCommited ?? "rgba(255, 255, 255, 0.01)" }}>30d</Tab>
                        </TabList>
                    </Tabs>
                </Box>
                <Stack
                    width="100%"
                    minHeight="356px"
                    padding="12px"
                    borderRadius="12px"
                    background={reactiveDesignColour ? reactiveDesignColour.replace("b(", "ba(").replace(")", ",0.25)") : "rgba(255, 255, 255, 0.04)"}
                    gap="12px"
                >
                    {!topSongsLoading ? (<>
                        {/* Number 1 song */}
                        <HStack color="text.dark" transition=".3s">
                            <Image
                                src={userTopSongs.find(v => v.index == 0)?.imageUrl}
                                width="84px"
                                borderRadius="8px"
                            />
                            <Box pos="relative" width="100%">
                                <Text
                                    fontWeight="black"
                                    fontSize="20px"
                                >Most Played</Text>
                                <Text
                                    fontWeight="medium"
                                    fontSize="18px"
                                >Listened {userTopSongs.find(v => v.index == 0)?.playCount == 1 ? "once" : userTopSongs.find(v => v.index == 0)?.playCount + " times"}</Text>
                                <HStack whiteSpace="nowrap" width="100%" paddingRight="5px" margin="0 auto" overflow="hidden" gap="5px" ref={scrollItemRef}>
                                    <Box
                                        ref={scrollItemRef}
                                        // display="inline-block"
                                        transform={`translateX(-${topSongOverflow}px)`}
                                        transition="transform 5s ease-in-out"
                                    >
                                        <HStack>
                                            <Text
                                                fontWeight="medium"
                                                fontSize="18px"
                                            >{userTopSongs.find(v => v.index == 0)?.title}</Text>
                                            <MdExplicit />
                                            <Text>• {userTopSongs.find(v => v.index == 0)?.artists.join(", ")}</Text>
                                        </HStack>
                                    </Box>
                                </HStack>
                                {/* <HStack pos="absolute" top="0" right="5px" gap="5px" onClick={() => {
                                    const top = userTopSongs.find(v => v.index == 0);

                                    if (top?.id)
                                        window.open(getSpotifyDeeplink(top.id));
                                }}>
                                    <Box>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,256,256" width="26px" height="26px" fill-rule="nonzero"><g fill="#cccccc" fill-rule="nonzero" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-dasharray="" stroke-dashoffset="0" font-family="none" font-weight="none" font-size="none" text-anchor="none"><g transform="scale(5.12,5.12)"><path d="M25.009,1.982c-12.687,0 -23.009,10.322 -23.009,23.009c0,12.687 10.322,23.009 23.009,23.009c12.687,0 23.009,-10.321 23.009,-23.009c0,-12.688 -10.322,-23.009 -23.009,-23.009zM34.748,35.333c-0.289,0.434 -0.765,0.668 -1.25,0.668c-0.286,0 -0.575,-0.081 -0.831,-0.252c-2.473,-1.649 -6.667,-2.749 -10.167,-2.748c-3.714,0.002 -6.498,0.914 -6.526,0.923c-0.784,0.266 -1.635,-0.162 -1.897,-0.948c-0.262,-0.786 0.163,-1.636 0.949,-1.897c0.132,-0.044 3.279,-1.075 7.474,-1.077c3.5,-0.002 8.368,0.942 11.832,3.251c0.69,0.46 0.876,1.391 0.416,2.08zM37.74,29.193c-0.325,0.522 -0.886,0.809 -1.459,0.809c-0.31,0 -0.624,-0.083 -0.906,-0.26c-4.484,-2.794 -9.092,-3.385 -13.062,-3.35c-4.482,0.04 -8.066,0.895 -8.127,0.913c-0.907,0.258 -1.861,-0.272 -2.12,-1.183c-0.259,-0.913 0.272,-1.862 1.184,-2.12c0.277,-0.079 3.854,-0.959 8.751,-1c4.465,-0.037 10.029,0.61 15.191,3.826c0.803,0.5 1.05,1.56 0.548,2.365zM40.725,22.013c-0.373,0.634 -1.041,0.987 -1.727,0.987c-0.344,0 -0.692,-0.089 -1.011,-0.275c-5.226,-3.068 -11.58,-3.719 -15.99,-3.725c-0.021,0 -0.042,0 -0.063,0c-5.333,0 -9.44,0.938 -9.481,0.948c-1.078,0.247 -2.151,-0.419 -2.401,-1.495c-0.25,-1.075 0.417,-2.149 1.492,-2.4c0.185,-0.043 4.573,-1.053 10.39,-1.053c0.023,0 0.046,0 0.069,0c4.905,0.007 12.011,0.753 18.01,4.275c0.952,0.56 1.271,1.786 0.712,2.738z"></path></g></g></svg>
                                    </Box>
                                    <Box fontSize="12px" lineHeight="15px">
                                        <Text>Play on</Text>
                                        <Text>Spotify</Text>
                                    </Box>
                                </HStack> */}
                            </Box>
                        </HStack>

                        <Stack gap="10px" paddingBottom="2px" transition=".3s">
                            {userTopSongs.slice(1, userTopSongs.length).map((v) => {
                                return (
                                    <LeaderboardSongItem
                                        key={v.index + v.title + v.artists.join("") + v.playCount + topSongsFilter}
                                        leaderboardPosition={v.index + 1}
                                        imageUrl={v.imageUrl}
                                        title={v.title}
                                        artists={v.artists}
                                        playCount={v.playCount}
                                    />
                                );
                            })}
                        </Stack>
                    </>) : (
                        <Box width="100%" height="356px" display="flex" alignItems="center" justifyContent="center">
                            <Spinner size="lg" />
                        </Box>
                    )}
                </Stack>
            </Stack>
        </Stack>
        </>);
}