import PageRouter from "@/lib/page-router";
import User, { FriendListenershipItem } from "@/lib/usrlib";
import {
    Text,
    Image,
    Box,
    HStack,
    VStack,
    useDisclosure,
    Stack,
    Center,
    Spinner
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { SmallAddButton } from "./small-add-btn";
import { Loader } from "./loader";
import { PlaybackState } from "./playback-state";
import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import { Mutex } from "async-mutex";
import { API_URL } from "@/lib/const";
import { PlaybackHistoryItem } from "./playback-history-item";

const updateMutex = new Mutex();

export function UIApp({
    prouter,
    user,
}: Readonly<{
    prouter: PageRouter,
    user: User,
}>) {
    const [currentPage, setCurrentPage] = useState<string>("activity");
    const [currentPageTitle, setCurrentPageTitle] = useState<string>("Activity");
    const [prevPage, setPrevPage] = useState<string>("");
    const [pageSwitcherActive, setPageSwitcherActive] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isFading, setIsFading] = useState<boolean>(false);
    const [activityPageLoading, setActivityPageLoading] = useState<boolean>(true);
    const [livePlaybackStates, setLivePlaybackStates] = useState<UpdateEvent[]>([]);
    const [streamer, setStreamer] = useState<DataStreamer | null>(null);
    const [streamerReset, setStreamerReset] = useState<boolean>(false);
    const [discoveryData, setDiscoveryData] = useState<{
        id: string;
        title: string;
        artists: string[];
        album: string;
        likeness: number;
    }[]>([]);
    const [friendsListenershipData, setFriendsListenershipData] = useState<FriendListenershipItem[]>([]);

    // Lazy loading: how many history items to show at first
    const ITEMS_PER_BATCH = 20;
    const [visibleHistoryCount, setVisibleHistoryCount] = useState<number>(ITEMS_PER_BATCH);
    const historyEndRef = useRef<HTMLDivElement | null>(null);

    const updateFriendsListenershipHistory = async () => {
        const d = await user.getFriendsListenershipHistory();
        setFriendsListenershipData(d);
    };

    useEffect(() => {
        // When friendsListenershipData is refreshed, reset the visible count
        setVisibleHistoryCount(ITEMS_PER_BATCH);
    }, [friendsListenershipData]);

    // Intersection Observer to load more items as the sentinel comes into view
    useEffect(() => {
        if (!historyEndRef.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleHistoryCount((prevCount) =>
                        Math.min(prevCount + ITEMS_PER_BATCH, friendsListenershipData.length)
                    );
                }
            },
            {
                root: null,
                threshold: 1.0,
            }
        );
        observer.observe(historyEndRef.current);
        return () => {
            if (historyEndRef.current) {
                observer.unobserve(historyEndRef.current);
            }
        };
    }, [friendsListenershipData]);

    useEffect(() => {
        // Extra actions to perform when page switched
        if (currentPage == "activity") {
            // Refresh friends listenership history data
            updateFriendsListenershipHistory();
        }
    }, [currentPage]);

    useEffect(() => {
        if (!user.isLoggedIn) return;

        const newStreamer = new DataStreamer(user.storedToken);
        setStreamer(newStreamer);

        newStreamer.on("update", (data: UpdateEvent) => {
            setActivityPageLoading(false);

            updateMutex.runExclusive(() => {
                setLivePlaybackStates((v) => {
                    const existing = v.find((a) => a.userId === data.userId);
                    if (existing && data.data.action.type == "STOPPED") {
                        return v.filter((a) => a.userId !== data.userId);
                    } else if (!existing && data.data.action.type !== "STOPPED") {
                        return [...v, data].sort((a, b) => {
                            return (a.data.state?.username ?? "").localeCompare(
                                b.data.state?.username ?? ""
                            );
                        });
                    }
                    return v;
                });
            });
        });

        newStreamer.on("remove", (userId) => {
            updateMutex.runExclusive(() => {
                setLivePlaybackStates((v) => {
                    return v.filter((a) => a.userId !== userId);
                });
            });
        });

        newStreamer.on("close", () => {
            // Connection lost, display loading screen and trust the connection strategy will reconnect
            setActivityPageLoading(true);
        });

        newStreamer.init();

        // Fetch user discovery page data
        fetch(API_URL + "/me/taste", {
            headers: {
                ...user.getAuthHeaders(),
            },
            credentials: "include",
        })
            .then((r) => r.json())
            .then((r) => {
                const data: {
                    error: boolean;
                    message?: string;
                    data: {
                        id: string;
                        title: string;
                        artists: string[];
                        album: string;
                        likeness: number;
                    }[];
                } = r;

                if (data.error) {
                    console.warn("Failed to fetch discovery data due to error response:", data);
                    return;
                }

                console.log("Got discovery data:", data.data);
                setDiscoveryData(data.data);
            })
            .catch((ex) => {
                console.warn("Failed to fetch user discovery data due to request error:", ex);
            });

        // Fetch friends listenership history
        updateFriendsListenershipHistory();

        return () => {
            newStreamer.cleanup();
        };
    }, [user.isLoggedIn]);

    useEffect(() => {
        const handleFocus = async () => {
            if (streamer && !streamer.isReady()) {
                setActivityPageLoading(true);
                setLivePlaybackStates([]);
                setStreamerReset(true);
            }
            updateFriendsListenershipHistory();
        };

        window.addEventListener("focus", handleFocus);
        return () => {
            window.removeEventListener("focus", handleFocus);
        };
    }, [streamer]);

    useEffect(() => {
        if (streamerReset && streamer && livePlaybackStates.length == 0) {
            streamer.cleanup();
            streamer.init();
            setStreamerReset(false);
        }
    }, [livePlaybackStates, streamer, streamerReset]);

    const pages: { name: string; id: string; indexed: boolean }[] = [
        {
            name: "Discover",
            id: "discover",
            indexed: true,
        },
        {
            name: "Activity",
            id: "activity",
            indexed: true,
        },
        {
            name: "Friends",
            id: "friends",
            indexed: true,
        },
        {
            name: "Profile",
            id: "settings",
            indexed: true,
        },
    ];

    const pageChanger = (id: string, prevPage?: string) => {
        let exists = false;
        let title = "";

        for (const page of pages) {
            if (page.id == id) {
                exists = true;
                title = page.name;
                break;
            }
        }

        if (!exists)
            throw new Error(
                "Attempted to switch to page with id \"" +
                    id +
                    "\", but a page cannot be found with that id!"
            );

        setCurrentPage(id);
        setCurrentPageTitle(title);
        setPrevPage(prevPage ?? "");
    };

    const handlePageMenuClick = () => {
        if (prevPage !== "") return pageChanger(prevPage);
        setPageSwitcherActive(!pageSwitcherActive);
    };

    const addNewItemPossiblePages = ["friends"];

    return (
        <>
            <Box
                position="fixed"
                top="0"
                left="0"
                width="100%"
                height="100%"
                background="white"
                zIndex="9999999"
                display={isLoading || isFading ? "flex" : "none"}
                alignItems="center"
                justifyContent="center"
                opacity={isLoading ? 1 : 0}
                transition="opacity 0.15s ease-out"
                onTransitionEnd={() => {
                    if (!isLoading) setIsFading(false);
                }}
            >
                <Loader />
            </Box>

            {/* The main user interface */}
            <Box padding="20px" width="100%">
                <Image
                    src="/menu-bg.png"
                    position="absolute"
                    zIndex="9"
                    width={pageSwitcherActive ? "100%" : "75%"}
                    height={pageSwitcherActive ? "100%" : "75%"}
                    top={pageSwitcherActive ? "0px" : "-15px"}
                    left={pageSwitcherActive ? "0px" : "-25px"}
                    overflow="hidden"
                    transition=".3s"
                    userSelect="none"
                    opacity={pageSwitcherActive ? "1" : "0"}
                    style={{
                        WebkitTouchCallout: "none",
                    }}
                    backdropFilter="blur(2px)"
                    draggable={false}
                    pointerEvents="none"
                />

                <Box
                    position="fixed"
                    width="100vw"
                    height="100vh"
                    top="0"
                    left="0"
                    zIndex="8"
                    background="rgba(0, 0, 0, 0.2)"
                    opacity={pageSwitcherActive ? "1" : "0"}
                    transition=".3s"
                    pointerEvents="none"
                    overflow="hidden"
                />

                <Box
                    width="100vw"
                    height="100px"
                    pos="fixed"
                    top="0"
                    left="0"
                    background="linear-gradient(180deg, rgb(13,13,14) 10%, rgba(13,13,14,0) 100%)"
                    zIndex="999"
                    pointerEvents="none"
                    marginTop="env(safe-area-inset-top)"
                />

                <HStack
                    width="100%"
                    height="100%"
                    marginLeft="0"
                    marginRight="0"
                    marginTop="-15px"
                >
                    <Box position="fixed" overflow="hidden" zIndex="9999" top="env(safe-area-inset-top)">
                        <HStack gap="10px" onClick={handlePageMenuClick}>
                            <Image
                                src="/icons/ui/chevron.svg"
                                transform={
                                    pageSwitcherActive
                                        ? "rotate(180deg)"
                                        : prevPage !== ""
                                        ? "rotate(90deg)"
                                        : "rotate(0deg)"
                                }
                                transition=".3s"
                                zIndex="10"
                                onLoad={() => {
                                    setTimeout(() => {
                                        setIsFading(true);
                                        setIsLoading(false);
                                    }, 1250);
                                }}
                            />
                            <Text
                                fontFamily="Inter"
                                fontWeight="black"
                                fontSize="36px"
                                color="text.color"
                                zIndex="10"
                                transition=".2s"
                                whiteSpace="nowrap"
                                opacity={pageSwitcherActive ? "0" : "1"}
                                marginLeft={pageSwitcherActive ? "-10px" : ""}
                            >
                                {currentPageTitle}
                            </Text>
                        </HStack>
                    </Box>
                    <VStack
                        position="absolute"
                        top="75px"
                        marginTop="env(safe-area-inset-top)"
                        alignItems="normal"
                        pointerEvents={pageSwitcherActive ? "all" : "none"}
                    >
                        {pages
                            .filter((v) => {
                                return v.indexed;
                            })
                            .map((v, i) => {
                                if (!v.indexed) return;
                                return (
                                    <>
                                        <Text
                                            float="left"
                                            fontFamily="Inter"
                                            fontWeight={currentPage == v.id ? "bold" : "medium"}
                                            fontSize="36px"
                                            color="text.color"
                                            zIndex="10"
                                            transition="margin .25s ease-out, opacity .2s"
                                            whiteSpace="nowrap"
                                            marginLeft={pageSwitcherActive ? "0" : "-75px"}
                                            opacity={pageSwitcherActive ? (currentPage == v.id ? "1" : "0.75") : "0"}
                                            // Increase transition delay as we go further down the list
                                            transitionDelay={
                                                pageSwitcherActive ? 0 + (i + 1) / 12 + "s" : "0"
                                            }
                                            onClick={
                                                currentPage == v.id
                                                    ? handlePageMenuClick
                                                    : () => {
                                                          pageChanger(v.id);
                                                          handlePageMenuClick();
                                                      }
                                            }
                                            userSelect="none"
                                        >
                                            {v.name}
                                        </Text>
                                    </>
                                );
                            })}
                    </VStack>
                    <SmallAddButton
                        onClick={() => {
                            if (pageSwitcherActive) return;
                            if (currentPage == "friends") pageChanger("new-friend", "friends");
                        }}
                        isCross={false}
                        scale={prevPage || !addNewItemPossiblePages.includes(currentPage) ? 0.65 : 1}
                        opacity={prevPage || !addNewItemPossiblePages.includes(currentPage) ? "0" : "1"}
                        active={prevPage == "" || !addNewItemPossiblePages.includes(currentPage)}
                        zIndex="9999999999"
                    />
                </HStack>

                <Box
                    pointerEvents={pageSwitcherActive ? "none" : "all"}
                    zIndex="5"
                    overflow="hidden"
                    height="100%"
                    width="100%"
                    display="fixed"
                    top="0"
                    left="0"
                >
                    {/* Discover page */}
                    {currentPage == "discover" && (
                        <>
                            {discoveryData.length == 0 ? (
                                <Text
                                    position="absolute"
                                    top="0"
                                    left="0"
                                    justifyContent="center"
                                    alignItems="center"
                                    display="flex"
                                    height="calc(100vh - 72px)"
                                    width="100vw"
                                    color="text.dark"
                                    margin="auto"
                                    textAlign="center"
                                    fontFamily="Inter"
                                    fontSize="16px"
                                    fontWeight="regular"
                                    zIndex="1"
                                >
                                    Tempo is learning your music taste.
                                    <br />
                                    We'll let you know when Discover is ready!
                                </Text>
                            ) : (
                                <Stack gap="10px">
                                    {discoveryData.map((v) => {
                                        return (
                                            <Box key={v.title + v.likeness}>
                                                <Text>
                                                    {v.title} ({v.artists.join(", ")}) -{" "}
                                                    {Math.ceil(v.likeness * 100)}%
                                                </Text>
                                            </Box>
                                        );
                                    })}
                                </Stack>
                            )}
                        </>
                    )}

                    {/* Activity page */}
                    {currentPage == "activity" && (
                        <>
                            {activityPageLoading ? (
                                <Center pos="absolute" width="100vw" height="100vh" top="0" left="0">
                                    <Spinner size="lg" />
                                </Center>
                            ) : (
                                <Stack gap="28px" overflowY="auto" paddingBottom="18px" width="100%">
                                    <Stack gap="18px" overflowY="auto" width="100%">
                                        <Text
                                            fontFamily="arial, helvetica"
                                            fontWeight="bold"
                                            fontSize="24px"
                                        >
                                            Latest
                                        </Text>
                                        {livePlaybackStates.map((v, i) => {
                                            const data = v.data;
                                            return (
                                                <>
                                                    {i !== 0 && (
                                                        <Box
                                                            width="100%"
                                                            height="1px"
                                                            background="rgba(255, 255, 255, 0.2)"
                                                        />
                                                    )}
                                                    <PlaybackState
                                                        key={
                                                            "ps-" +
                                                            v.userId +
                                                            data.state?.songId +
                                                            (data.state?.artists ? "AA" : "ANA")
                                                        }
                                                        index={i}
                                                        stream={streamer}
                                                        userId={v.userId}
                                                    />
                                                </>
                                            );
                                        })}
                                    </Stack>
                                    <Stack gap="12px" overflowY="auto" width="100%">
                                        <Text
                                            fontFamily="arial, helvetica"
                                            fontWeight="bold"
                                            fontSize="24px"
                                        >
                                            History
                                        </Text>
                                        {friendsListenershipData
                                            .slice(0, visibleHistoryCount)
                                            .map((v, i) => {
                                                const data = v;
                                                return (
                                                    <>
                                                        {i !== 0 && (
                                                            <Box
                                                                width="100%"
                                                                height="1px"
                                                                background="rgba(255, 255, 255, 0.2)"
                                                            />
                                                        )}
                                                        <PlaybackHistoryItem data={data} />
                                                    </>
                                                );
                                            })}
                                        {/* Sentinel element for lazy loading */}
                                        <div ref={historyEndRef} />
                                    </Stack>
                                </Stack>
                            )}
                        </>
                    )}

                    {/* Friends page */}
                    {currentPage == "friends" && (
                        <>
                            <Image
                                src={`/add-new-case-indication-arrow.svg`}
                                position="absolute"
                                right="46px"
                                top="48px"
                                zIndex="999999999"
                            />
                            <Text
                                position="absolute"
                                top="0"
                                left="0"
                                justifyContent="center"
                                alignItems="center"
                                display="flex"
                                height="calc(100vh - 72px)"
                                width="100vw"
                                color="text.dark"
                                margin="auto"
                                textAlign="center"
                                fontFamily="Inter"
                                fontSize="16px"
                                fontWeight="regular"
                                zIndex="1"
                            >
                                Tempo is better with friends!
                                <br />
                                Why not try adding someone?
                            </Text>
                        </>
                    )}

                    {/* Settings page */}
                    {currentPage == "settings" && (
                        <>
                            <HStack gap="24px" marginTop="24px">
                                <Image
                                    src={`https://gravatar.com/avatar/${"gravatarHash"}?d=identicon&t=${"pfpCacheBuster"}&s=80`}
                                    width="80px"
                                    height="80px"
                                    borderRadius="50%"
                                    background="rgba(255, 255, 255, 0.05)"
                                    draggable={false}
                                />
                                <Stack gap="0">
                                    <Text
                                        fontFamily="Inter"
                                        fontWeight="regular"
                                        fontSize="14px"
                                        color="skyblue"
                                        opacity="0.75"
                                        onClick={() => {
                                            pageChanger("edit-profile", "settings");
                                        }}
                                    >
                                        Edit Profile
                                    </Text>
                                </Stack>
                            </HStack>
                            <Box
                                width="100%"
                                height="1px"
                                marginTop="24px"
                                marginBottom="24px"
                                background="rgba(255, 255, 255, 0.05)"
                            />
                            <Text fontFamily="Inter" fontWeight="bold" fontSize="24px" marginTop="-12px">
                                Invite Colleagues
                            </Text>
                        </>
                    )}
                </Box>
            </Box>
        </>
    );
}
