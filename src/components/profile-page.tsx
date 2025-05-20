import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import User, { ClientUserAccount } from "@/lib/usrlib";
import { HStack, Stack, Box, Image, Text, Avatar, Tabs, TabList, Tab, TabPanels, TabPanel, Center, Spinner } from "@chakra-ui/react";
import { use, useEffect, useRef, useState } from "react";
import ReactTimeAgo from "react-time-ago";
import { formatTimeToMinAndHour, getSpotifyDeeplink, PlaybackState, SkeletonImage } from "./playback-state";
import { FastAverageColor } from 'fast-average-color';
import { apcach, crToBg } from "apcach";
import { oklch, formatHex } from 'culori';
import LeaderboardSongItem from "./leaderboard-song-item";
import { MdExplicit } from "react-icons/md";
import { getSizedImageUrl } from "@/lib/sized-img";
import { findBestSCDNImageSize } from "@/lib/utils";
import { FaCog, FaHistory } from "react-icons/fa";
import { Recap } from "./recap-drawer";
import FriendHistoryFeed from "./friend-history-feed";
import { lerp } from "three/src/math/MathUtils.js";

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

const PROFILE_ITEM_GAP = 18;

function forcedPaddingSize(
    originalSize: number,
    // % (0 - 100)
    percentVisible: number,
    // % (0 - 100)
    minPercent: number,
    // A ratio (0 - 1)
    target: number,
    log?: boolean,
    easing: number = 10,
): number {
    // Clamp visible percent between 0 and 100
    const clampedVisible = Math.max(0, Math.min(100, percentVisible));
    const clampedMin = Math.max(0, Math.min(100, minPercent));

    if (clampedVisible <= clampedMin) {
        if (log) console.log("Below minPercent → using originalSize:", originalSize, "clampedVisible:", clampedVisible);
        return originalSize;
    }

    // Convert to normalized [0–1] scale
    const normalizedProgress = (clampedVisible - clampedMin) / (100 - clampedMin);

    // Apply easing
    const easedProgress = Math.pow(normalizedProgress, easing);

    // Interpolate toward target size
    const targetSize = originalSize * target;
    const interpolatedSize = originalSize - easedProgress * (originalSize - targetSize);

    if (log) {
        console.log(
            `originalSize=${originalSize}, clampedVisible=${clampedVisible}, percentVisible=${percentVisible.toFixed(2)}, minPercent=${minPercent}, progress=${normalizedProgress.toFixed(2)}, easedProgress=${easedProgress.toFixed(2)}, interpolatedSize=${interpolatedSize}`
        );
    }

    return interpolatedSize;
}

function dynamicForcedPaddingSize(
    value: number,
    percentVisible: number, // % (0 - 100)
    minPercent: number,     // % (0 - 100)
    target: number,         // Ratio (0 - 1)
    log?: boolean,
    easing: number = 2
): number {
    // Clamp visible percent between 0 and 100
    const clampedVisible = Math.max(0, Math.min(100, percentVisible));
    const clampedMin = Math.max(0, Math.min(100, minPercent));

    if (clampedVisible <= clampedMin) {
        if (log) console.log("Below minPercent → using value:", value, "clampedVisible:", clampedVisible);
        
        return value;
    }

    // Convert to normalized [0–1] scale
    const normalizedProgress = (clampedVisible - clampedMin) / (100 - clampedMin);
    
    const interpolated = value - Math.pow(normalizedProgress, easing) * (value - target);

    return Math.max(target, interpolated);
}

function easeInOutCubic(t: number): number {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default function ProfilePage({
    user,
    targetUserId,
    pageChanger,
    admin,
    hideTopGradientCb,
    setComplementaryColour,
    setRecaps,
    openRecapDrawer,
    streamer,
}: Readonly<{
    user: User;
    targetUserId?: string;
    pageChanger: (id: string, prevPage?: string) => void;
    admin?: boolean;
    hideTopGradientCb: (hide: boolean) => void;
    setComplementaryColour: (hex: string) => void;
    setRecaps:(data: {
        daily: Recap | null;
        weekly: Recap | null;
    }) => void;
    openRecapDrawer: () => void;
    streamer?: DataStreamer;
}>) {
    const [profileData, setProfileData] = useState<ClientUserAccount | undefined>(user.object);
    const [pfpLoadFailed, setPfpLoadFailed] = useState(false);
    // const [streamer, setStreamer] = useState<DataStreamer | null>(null);
    const [streamerReset, setStreamerReset] = useState<boolean>(false);
    const [playbackState, setPlaybackState] = useState<UpdateEvent | null>(null);
    const [reactiveDesignColour, setReactiveDesignColour] = useState<string | null>(null);
    const [widgetBgColour, setWidgetBgColour] = useState<string | null>(null);
    const [reactiveDesignColourCommited, setReactiveDesignColourCommited] = useState<string | null>(null);
    const [displayReactiveDesignColour, setDisplayReactiveDesignColour] = useState<boolean>(false);
    const [reactiveDesignComplementaryColour, setReactiveDesignComplementaryColour] = useState<string | null>(null);
    const [listenershipHistoryAvailable, setListenershipHistoryAvailable] = useState<boolean>(false);
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
    const [pastWeekStats, setPastWeekStats] = useState<{
        totalListeningDuration: number;
        uniqueSongsPlayedCount: number;
        longestStreak: number;
    } | undefined>();
    const [recapState, setRecapsState] = useState<{
        daily: Recap | null;
        weekly: Recap | null;
    }>({
        daily: null,
        weekly: null,
    });
    const [useHistoryFullPageView, setUseHistoryFullPageView] = useState<boolean>(false);
    const [listenershipHistoryYOffset, setListenershipHistoryYOffset] = useState<number>(-999);
    // const [fakeHistoryHeight, setFakeHistoryHeight] = useState<number>(-999);
    const [windowHeight, setWindowHeight] = useState<number>(-999);
    const [historyPercentVisible, setHistoryPercentVisible] = useState<number>(-999);

    const listenershipHistoryEl = useRef<HTMLDivElement>(null);
    const dynamicContentEl = useRef<HTMLDivElement>(null);

    const scrollItemRef = useRef<HTMLDivElement>(null);

    const lastActive = new Date().getTime();

    const setStatusBarColour = (colour: string) => {
        const themeColour = document.querySelector("meta[name=theme-color]");
        themeColour?.setAttribute("content", colour);
    }

    useEffect(() => {
        user.getRecaps(true)
        .then(recaps => {
            setRecapsState(recaps);
        })
        .catch(ex => {
            console.error("Failed to fetch latest user recaps, error:", ex);
        });

        user.getRemoteUserPastWeekStats(targetUserId ?? user.id)
        .then(d => {
            setPastWeekStats(d);
        })
        .catch(e => {
            console.error("Failed to fetch past week stats, error:", e);
        });

        user.getFriendProfileListenershipHistory(targetUserId ?? user.id, 0)
        .then(h => {
            if (h.data.length > 0)
                setListenershipHistoryAvailable(true);
        })
        .catch(e => {
            console.error("Failed to check if listenership history is available, error:", e);
        });

        if (!targetUserId)
            return;

        setProfileData(undefined);
    }, [])

    useEffect(() => {
        if (!scrollItemRef.current)
            return;

        if (scrollItemRef.current.getBoundingClientRect().width <= window.innerWidth - 155)
            return;

        const process = () => {
            if (scrollItemRef.current && topSongOverflow <= 0)
                setTopSongOverflow(scrollItemRef.current.getBoundingClientRect().width - (window.innerWidth - 162));
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

        const setWidgetBg = (colourHex: string) => {
            const getColour = (value: number, divisor: number) => {
                return Math.round(value / divisor);
            }

            const r = parseInt(colourHex.split("(")[1].split(" ").join("").split(",")[0]);
            const g = parseInt(colourHex.split("(")[1].split(" ").join("").split(",")[1]);
            const b = parseInt(colourHex.split("(")[1].split(" ").join("").split(",")[2]);

            setWidgetBgColour(`linear-gradient(135deg, rgba(${getColour(r, 2)}, ${getColour(g, 2)}, ${getColour(b, 2)}, 1), rgba(${getColour(r, 4)}, ${getColour(g, 4)}, ${getColour(b, 4)}, 1))`);
        }

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
                setWidgetBg(color.rgb);
                hideTopGradientCb(true);
            })
            .catch(e => {
                console.log(e);
            });
        }
        
        if (!streamer)
            return;

        if (streamer.detachedListeningStateQuery([targetUserId ?? user.id]))
            loadCb("top-grad");

        if (streamer.isOpen) {
            loadCb("remote-user-stream");
        } else {
            streamer.on("open", () => {
                loadCb("remote-user-stream");
            });
        }

        // streamer.on("not-listening", (userIds: string[]) => {
        //     loadCb("top-grad");
        // });

        streamer.on("update", (data: UpdateEvent) => {
            if (data.userId !== (targetUserId ?? user.id))
                return;

            setPlaybackState((v) => {
                if (data.data.state) {
                    streamerGotMsg = true;

                    const fac = new FastAverageColor();
                    
                    fac.getColorAsync(data.data.state.imageUrl)
                    .then(color => {
                        setReactiveDesignColour(color.rgb);
                        setWidgetBg(color.rgb);
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

        streamer.on("remove", (userId) => {
            if (userId === (targetUserId ?? user.id)) {
                setPlaybackState(null);
                setReactiveDesignColour(null);
            }
        });

        streamer.on("close", () => {
            // no-op, state will update once connection re-established
        });

        // newStreamer.init();

        // return () => {
        //     newStreamer.cleanup();
        // };
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

    useEffect(() => {
        if (!dynamicContentEl?.current)
            return;

        // const loop = setInterval(() => {
        if (!dynamicContentEl?.current)
            return;

        const bounds = dynamicContentEl.current.getBoundingClientRect();

        setListenershipHistoryYOffset(bounds.height + bounds.y + PROFILE_ITEM_GAP);

        setWindowHeight(window.innerHeight);
        // }, 100);

        // return () => {
        //     clearInterval(loop);
        // }
    }, [dynamicContentEl]);

    const observer = useRef<IntersectionObserver | null>(null);
    const animationFrame = useRef<number | null>(null);
    
    useEffect(() => {
        if (!listenershipHistoryAvailable || !listenershipHistoryEl?.current) return;

        const easeInOutCubic = (t: number) =>
            t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        const updateYOffset = (percentVisible: number) => {
            const bounds = dynamicContentEl.current!.getBoundingClientRect();
            
            const targetOffset = dynamicForcedPaddingSize(
                dynamicContentEl.current!.clientHeight + bounds.y + PROFILE_ITEM_GAP,
                percentVisible,
                80,
                0
            );

            setListenershipHistoryYOffset(targetOffset);
        };

        const observerCallback: IntersectionObserverCallback = (entries) => {
            entries.forEach((entry) => {
                const rect = entry.boundingClientRect;
                const windowHeight = window.innerHeight;

                const visibleTop = Math.max(rect.top, 0);
                const visibleBottom = Math.min(rect.bottom, windowHeight);
                const visibleHeight = Math.max(0, visibleBottom - visibleTop);

                const percentVisible = (visibleHeight / rect.height) * 100;

                if (animationFrame.current)
                    cancelAnimationFrame(animationFrame.current);

                animationFrame.current = requestAnimationFrame(() => {
                    updateYOffset(percentVisible);

                    const passedCriticalVisibility = percentVisible >= 80;

                    if (!useHistoryFullPageView && passedCriticalVisibility) {
                        setUseHistoryFullPageView(true);
                    } else if (useHistoryFullPageView && !passedCriticalVisibility) {
                        setUseHistoryFullPageView(false);
                    }

                    if (passedCriticalVisibility) {
                        setHistoryPercentVisible(percentVisible);
                    }
                });
            });
        };

        observer.current = new IntersectionObserver(observerCallback, {
            threshold: Array.from({ length: 251 }, (_, i) => i / 250),
        });

        observer.current.observe(listenershipHistoryEl.current);

        return () => {
            if (observer.current) observer.current.disconnect();
            if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
        };
    }, [listenershipHistoryAvailable, listenershipHistoryEl, dynamicContentEl, useHistoryFullPageView]);

    return (<>
        {!targetUserId && (
            <HStack
                pos="fixed"
                height="48px"
                top="5px"
                right="20px"
                zIndex="99999"
                display="flex"
                justifyContent="center"
                alignItems="center"
                gap="10px"
            >
                {(recapState.daily || recapState.weekly) && (
                    <FaHistory size="26px" color={reactiveDesignComplementaryColour ?? "text.dark"} onClick={() => {
                        setRecaps(recapState);
                        openRecapDrawer();
                    }} />
                )}
                <FaCog size="26px" color={reactiveDesignComplementaryColour ?? "text.dark"} onClick={() => {
                    pageChanger("preferences", "settings");
                }} />
            </HStack>
        )}

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
        <Stack gap={`${PROFILE_ITEM_GAP}px`} width="100%" zIndex="1" position="relative" marginTop="-15px">
            <Stack gap={`${PROFILE_ITEM_GAP}px`} ref={dynamicContentEl}>
                {/* <Box pos="absolute" background="red" width="100vw" height="100vh" top="0" left= zIndex={0} /> */}
                <HStack gap="14px" marginTop="24px">
                    <Box width="88px" height="88px" border={playbackState ? "3px solid #A480FF" : "0px"} borderRadius="17px" transition=".15s">
                        {((profileData?.images.length ?? 0) > 0 && !pfpLoadFailed) ? (
                            <SkeletonImage
                                width={playbackState ? "82px" : "88px"}
                                height={playbackState ? "82px" : "88px"}
                                borderRadius="14px"
                                transition=".15s"
                                border={playbackState ? "2px solid transparent" : "0px"}
                                src={getSizedImageUrl(findBestSCDNImageSize(profileData?.images ?? [], 120, 120) ?? "", 120, 120)}
                                onError={() => {
                                    setPfpLoadFailed(true);
                                }}
                            />
                        ) : (
                            <Avatar
                                // Append user id so that different users potentially with same name has different bg colours
                                name={profileData?.displayName ?? "" + profileData?.id ?? ""}
                                borderRadius="14px"
                                transition=".15s"
                                border={playbackState ? "2px solid transparent" : "0px"}
                                width={playbackState ? "82px" : "88px"}
                                height={playbackState ? "82px" : "88px"}
                            />
                        )}
                    </Box>
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
                        {profileData?.listenerTypeClassification ?? "Casual Listener"}
                        </Text>
                        {(playbackState?.data.state?.playSessionStart && playbackState?.data.state?.playSessionStart !== -1 && new Date().getTime() - playbackState.data.state.playSessionStart >= (60e3 * 5)) ? (
                            <Text>{`🔥 ${formatTimeToMinAndHour(new Date().getTime() - playbackState?.data.state.playSessionStart, true)}`}</Text>
                        ) : playbackState ? (
                            <Text>Started listening recently</Text>
                        ) : (
                            <Text>No active streak</Text>
                        )}
                        {/* {!targetUserId && (
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
                        )} */}
                    </Stack>
                </HStack>
                {playbackState && (
                    <Stack gap="1px" overflow="hidden" transition=".5s">
                        <Text
                            fontFamily="Inter"
                            fontWeight="bold"
                            fontSize="24px"
                            color={reactiveDesignComplementaryColour ?? "text.dark"}
                            transition=".3s"
                        >Listening to</Text>
                        <PlaybackState
                            stream={streamer ?? null}
                            userId={targetUserId ?? user.id}
                            theme={reactiveDesignComplementaryColour ?? undefined}
                            hideProfile
                        />
                    </Stack>
                )}
                {pastWeekStats && (
                    <Stack gap="1px" overflow="hidden" transition=".5s">
                        <Text
                            fontFamily="Inter"
                            fontWeight="bold"
                            fontSize="24px"
                            color={reactiveDesignComplementaryColour ?? "text.dark"}
                            transition=".3s"
                        >Past Week</Text>
                        <HStack
                            width="100%"
                            minHeight="70px"
                            padding={{ base: "12px", md: "16px" }}
                            borderRadius="20px"
                            background={widgetBgColour ?? "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))"}
                            spacing={0}
                            pos="relative"
                            boxShadow="0 4px 12px rgba(0, 0, 0, 0.15)"
                        >
                            {[{
                                label: "Minutes Played",
                                value: Math.round((pastWeekStats?.totalListeningDuration ?? 0) / 60e3),
                            }, {
                                label: "Songs Played",
                                value: pastWeekStats?.uniqueSongsPlayedCount,
                            }, {
                                label: "Longest Streak",
                                value: formatTimeToMinAndHour(pastWeekStats?.longestStreak ?? 0, false),
                            }].map((item, index) => (
                                <>
                                    <Box
                                        flex="1"
                                        textAlign="center"
                                        px={{ base: "6px", md: "10px" }}
                                        py="6px"
                                        minWidth="0"
                                        overflow="hidden"
                                        textOverflow="ellipsis"
                                        whiteSpace="nowrap"
                                    >
                                        <Text
                                            fontFamily="Libre Franklin"
                                            fontSize={{ base: "18px", sm: "22px", md: "26px" }}
                                            fontWeight="extrabold"
                                            color="text.dark"
                                            letterSpacing="tight"
                                            whiteSpace="normal"
                                        >
                                            {item.value}
                                        </Text>
                                        <Text
                                            fontSize="12px"
                                            color="text.dark"
                                            opacity="0.7"
                                            mt="2px"
                                            whiteSpace="nowrap"
                                        >
                                            {item.label}
                                        </Text>
                                    </Box>

                                    {index < 2 && (
                                        <Box
                                            height={{ base: "60%", md: "75%" }}
                                            width="1px"
                                            background="rgba(255, 255, 255, 0.2)"
                                            borderRadius="full"
                                        />
                                    )}
                                </>
                            ))}
                        </HStack>
                    </Stack>
                )}
                {(userTopSongs.length > 0 && userTopSongs.find(v => v.index == 0)) && (
                    <Stack
                        transition=".3s"
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
                                    <Tab width="40px" fontSize="14px" borderRadius="12px" _selected={{ color: reactiveDesignComplementaryColour ?? "white", bg: reactiveDesignColourCommited?.replace("(", "a(").replace(")", ",0.9)") ?? "rgba(255, 255, 255, 0.01)" }}>24h</Tab>
                                    <Tab width="40px" fontSize="14px" borderRadius="12px" _selected={{ color: reactiveDesignComplementaryColour ?? "white", bg: reactiveDesignColourCommited?.replace("(", "a(").replace(")", ",0.9)") ?? "rgba(255, 255, 255, 0.01)" }}>7d</Tab>
                                    <Tab width="40px" fontSize="14px" borderRadius="12px" _selected={{ color: reactiveDesignComplementaryColour ?? "white", bg: reactiveDesignColourCommited?.replace("(", "a(").replace(")", ",0.9)") ?? "rgba(255, 255, 255, 0.01)" }}>30d</Tab>
                                </TabList>
                            </Tabs>
                        </Box>
                        <Stack
                            width="100%"
                            minHeight="356px"
                            padding="12px"
                            borderRadius="20px"
                            background={widgetBgColour ?? "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))"}
                            gap="12px"
                            pos="relative"
                        >
                            {!topSongsLoading ? (<>
                                {/* Number 1 song */}
                                <HStack color="text.dark" transition=".3s">
                                    <SkeletonImage
                                        src={getSizedImageUrl(userTopSongs.find(v => v.index == 0)?.imageUrl ?? "", 84, 84)}
                                        width="84px"
                                        height="84px"
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
                                        <HStack whiteSpace="nowrap" width="100%" paddingRight="5px" margin="0 auto" overflow="hidden" gap="5px">
                                            <Box
                                                ref={scrollItemRef}
                                                // display="inline-block"
                                                transform={`translateX(-${topSongOverflow}px)`}
                                                transition="transform 5s"
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
                                <Box
                                    width="100%"
                                    height="100%"
                                    pos="absolute"
                                    top="0"
                                    left="0"
                                >
                                    <Center height="100%">
                                        <Spinner size="lg" color={reactiveDesignComplementaryColour ?? "#ffffff"} />
                                    </Center>
                                </Box>
                            )}
                        </Stack>
                    </Stack>
                )}
            </Stack>
            {listenershipHistoryAvailable && (<>
                <Box h={536}>
                    <Stack
                        pos="relative"
                        opacity={useHistoryFullPageView ? 0 : 1}
                        pointerEvents="none"
                        ref={listenershipHistoryEl}
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
                                Listening History
                            </Text>
                            <Stack
                                width="100%"
                                maxHeight="500px"
                                overflowY="auto"
                                padding="12px"
                                borderRadius="20px"
                                background={widgetBgColour ?? "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))"}
                                gap="12px"
                                pos="relative"
                                sx={{
                                    scrollbarWidth: "none",
                                    "&::-webkit-scrollbar": {
                                        display: "none",
                                    },
                                }}
                            >
                                <FriendHistoryFeed
                                    userId={targetUserId ?? user.id}
                                    fetchHistory={(userId, page) => user.getFriendProfileListenershipHistory(userId, page)}
                                />
                            </Stack>
                        </Box>
                    </Stack>
                </Box>
                
                <Stack
                    // transition=".0s"
                    pos="fixed"
                    opacity={useHistoryFullPageView ? 1 : 0}
                    paddingLeft={`${forcedPaddingSize(20, historyPercentVisible, 80, 0)}px`}
                    paddingRight={`${forcedPaddingSize(20, historyPercentVisible, 80, 0)}px`}
                    width="100vw"
                    height={`${500 + ((windowHeight - 500) * (historyPercentVisible / 100))}px`}
                    left="0"
                    transition="top .01s"
                    top={`${listenershipHistoryYOffset}px`}
                    pointerEvents={historyPercentVisible == 100 ? "all" : "none"}
                    onWheel={(e: React.WheelEvent<HTMLDivElement>) => {
                        const el = document.querySelector("[data-profile-history-full-view]");

                        if (!el) return;

                        // If scrolling up and already at the top, pass scroll to parent with same delta
                        if (e.deltaY < 0 && el.scrollTop <= 0) {
                            const parent = document.querySelector("[data-profile-scroll-container]");

                            if (parent) {
                                parent.scrollTo({
                                    top: listenershipHistoryEl.current?.getBoundingClientRect().top,
                                    behavior: "smooth",
                                });
                            }
                        }
                    }}
                    onTouchStart={(e: React.TouchEvent<HTMLDivElement>) => {
                        // Store initial touch position
                        (e.currentTarget as any)._touchStartY = e.touches[0].clientY;
                    }}
                    onTouchMove={(e: React.TouchEvent<HTMLDivElement>) => {
                        const el = document.querySelector("[data-profile-history-full-view]");
                        if (!el) return;

                        const startY = (e.currentTarget as any)._touchStartY;
                        const currentY = e.touches[0].clientY;
                        const deltaY = startY - currentY;

                        // If scrolling up and already at the top, pass scroll to parent with same delta
                        if (deltaY < 0 && (el as HTMLElement).scrollTop <= 0) {
                            const parent = document.querySelector("[data-profile-scroll-container]");
                            if (parent) {
                                parent.scrollBy({
                                    top: deltaY,
                                    behavior: "auto"
                                });
                                // Prevent default to avoid rubber banding
                                e.preventDefault();
                            }
                        }
                    }}
                >
                    <Box>
                        <Text
                            fontFamily="Inter"
                            fontWeight="bold"
                            fontSize="24px"
                            color={reactiveDesignComplementaryColour ?? "text.dark"}
                            transition="color 3s"
                            float="left"
                            marginBottom={`-${60 - forcedPaddingSize(60, historyPercentVisible, 80, 0)}px`}
                            opacity={`${forcedPaddingSize(1, historyPercentVisible, 80, 0.2)}`}
                        >
                            Listening History
                        </Text>
                        <Stack
                            width="100%"
                            height={`${500 + ((windowHeight - 500) * (historyPercentVisible / 100))}px`}
                            overflowY="auto"
                            padding="12px"
                            paddingTop={`${Math.max(12, 64 - forcedPaddingSize(64, historyPercentVisible, 80, 0))}px`}
                            borderRadius={`${forcedPaddingSize(20, historyPercentVisible, 80, 0)}px`}
                            background={widgetBgColour ?? "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))"}
                            gap="12px"
                            pos="relative"
                            transition="background .3s"
                            sx={{
                                scrollbarWidth: "none",
                                "&::-webkit-scrollbar": {
                                    display: "none",
                                },
                            }}
                            data-profile-history-full-view
                        >
                            <FriendHistoryFeed
                                userId={targetUserId ?? user.id}
                                fetchHistory={(userId, page) => user.getFriendProfileListenershipHistory(userId, page)}
                            />
                        </Stack>
                    </Box>
                </Stack>
            </>)}
        </Stack>
    </>);
}