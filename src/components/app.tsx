import PageRouter from "@/lib/page-router";
import User, { FriendListenershipItem } from "@/lib/usrlib";
import {
    Text,
    Image,
    Box,
    HStack,
    VStack,
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
import { AddFriendsPage } from "./add-friends-page";

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
    const [friendsListenershipPage, setFriendsListenershipPage] = useState<number>(0);
    const [friendsListenershipIsLastPage, setFriendsListenershipIsLastPage] = useState<boolean>(false);
    const [friendsListenershipIsError, setFriendsListenershipIsError] = useState<boolean>(false);
    const [endOfHistoryMessage, setEndOfHistoryMessage] = useState<string>("You've seen it all! 😉");

    const ITEMS_PER_BATCH = 100;
    const [visibleHistoryCount, setVisibleHistoryCount] = useState<number>(ITEMS_PER_BATCH);
    const historyEndRef = useRef<HTMLDivElement | null>(null);

    async function loadFriendsHistory(page: number) {
        try {
            const res = await user.getFriendsListenershipHistory(page);
            setEndOfHistoryMessage(
                Math.random() <= 0.1 ? "~ End of historussy ~" : "You've seen it all! 😉"
            );
            setFriendsListenershipIsLastPage(res.l);
            setFriendsListenershipIsError(res.e);
            if (page === 0) {
                setFriendsListenershipData(res.d);
            } else {
                setFriendsListenershipData(prev => [...prev, ...res.d]);
            }
        } catch (err) {
            console.warn("Error loading history:", err);
            setFriendsListenershipIsError(true);
        }
    }

    useEffect(() => {
        loadFriendsHistory(friendsListenershipPage);
    }, [friendsListenershipPage]);

    useEffect(() => {
        if (friendsListenershipPage === 0) {
            setVisibleHistoryCount(ITEMS_PER_BATCH);
        } else {
            setVisibleHistoryCount(prev =>
                Math.min(prev + ITEMS_PER_BATCH, friendsListenershipData.length)
            );
        }
    }, [friendsListenershipData]);

    const incrementVisibleItems = () => {
        if (visibleHistoryCount < friendsListenershipData.length) {
            setVisibleHistoryCount(Math.min(visibleHistoryCount + ITEMS_PER_BATCH, friendsListenershipData.length));
        } else if (!friendsListenershipIsLastPage) {
            setFriendsListenershipPage(prev => prev + 1);
        }
    };

    useEffect(() => {
        if (!historyEndRef.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    incrementVisibleItems();
                }
            },
            { threshold: 0.1 }
        );
        observer.observe(historyEndRef.current);
        return () => {
            if (historyEndRef.current) observer.unobserve(historyEndRef.current);
        };
    }, [friendsListenershipData, visibleHistoryCount, friendsListenershipIsLastPage]);

    useEffect(() => {
        if (!user.isLoggedIn) return;
        const newStreamer = new DataStreamer(user.storedToken);
        setStreamer(newStreamer);

        newStreamer.on("update", (data: UpdateEvent) => {
            // Once we get any update, we consider activity loaded.
            setActivityPageLoading(false);
            updateMutex.runExclusive(() => {
                setLivePlaybackStates((v) => {
                    const existing = v.find((a) => a.userId === data.userId);
                    if (existing && data.data.action.type === "STOPPED") {
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
                setLivePlaybackStates((v) => v.filter((a) => a.userId !== userId));
            });
        });

        newStreamer.on("close", () => {
            setActivityPageLoading(true);
        });

        newStreamer.init();

        fetch(API_URL + "/me/taste", {
            headers: {
                ...user.getAuthHeaders(),
            },
            credentials: "include",
        })
            .then((r) => r.json())
            .then((r) => {
                if (r.error) {
                    console.warn("Failed to fetch discovery data:", r);
                    return;
                }
                setDiscoveryData(r.data);
            })
            .catch((ex) => {
                console.warn("Failed to fetch discovery data:", ex);
            });

        return () => {
            newStreamer.cleanup();
        };
    }, [user.isLoggedIn]);

    useEffect(() => {
        const handleFocus = async () => {
            setFriendsListenershipPage(0);
            await loadFriendsHistory(0);
        };
        window.addEventListener("focus", handleFocus);
        return () => {
            window.removeEventListener("focus", handleFocus);
        };
    }, []);

    // New effect to hide the loading screen once activity data is loaded.
    useEffect(() => {
        if (!activityPageLoading) {
            setTimeout(() => {
                setIsFading(true);
                setIsLoading(false);
            }, 1250);
        }
    }, [activityPageLoading]);

    const pages: { name: string; id: string; indexed: boolean }[] = [
        { name: "Discover", id: "discover", indexed: true },
        { name: "Activity", id: "activity", indexed: true },
        { name: "Friends", id: "friends", indexed: true },
        { name: "Profile", id: "settings", indexed: true },
        { name: "Add Friends", id: "add-friends", indexed: false }
    ];

    const pageChanger = (id: string, prevPage?: string) => {
        const page = pages.find((p) => p.id === id);
        if (!page) {
            throw new Error(`Attempted to switch to page with id "${id}" but no page was found!`);
        }
        setCurrentPage(id);
        setCurrentPageTitle(page.name);
        setPrevPage(prevPage ?? "");
    };

    const handlePageMenuClick = () => {
        if (prevPage !== "") {
            pageChanger(prevPage);
        } else {
            setPageSwitcherActive(!pageSwitcherActive);
        }
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
                zIndex="999999999999"
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

            <Box padding="20px" width="100%">
                {/* Menu and header elements omitted for brevity */}
                {currentPage === "activity" && (
                    <>
                        {activityPageLoading ? (
                            <Center pos="absolute" width="100vw" height="100vh" top="0" left="0">
                                <Spinner size="lg" />
                            </Center>
                        ) : (
                            <Stack gap="28px" overflowY="auto" paddingBottom="18px" width="100%">
                                <Stack gap="18px" overflowY="auto" width="100%">
                                    <Text fontFamily="arial, helvetica" fontWeight="bold" fontSize="24px">
                                        Latest
                                    </Text>
                                    {livePlaybackStates.map((v, i) => (
                                        <React.Fragment key={i}>
                                            {i !== 0 && (
                                                <Box
                                                    width="100%"
                                                    height="1px"
                                                    background="rgba(255, 255, 255, 0.2)"
                                                />
                                            )}
                                            <PlaybackState index={i} stream={streamer} userId={v.userId} />
                                        </React.Fragment>
                                    ))}
                                </Stack>
                                <Stack gap="12px" overflowY="auto" width="100%">
                                    <Text fontFamily="arial, helvetica" fontWeight="bold" fontSize="24px">
                                        History
                                    </Text>
                                    {friendsListenershipIsError ? (
                                        <Text
                                            marginTop="14px"
                                            width="100%"
                                            opacity="0.45"
                                            textAlign="center"
                                            onClick={() => setFriendsListenershipPage(0)}
                                        >
                                            Failed to load history, try again?
                                        </Text>
                                    ) : (
                                        <>
                                            {friendsListenershipData.slice(0, visibleHistoryCount).map((item, index) => (
                                                <React.Fragment key={index}>
                                                    {index !== 0 && (
                                                        <Box
                                                            width="100%"
                                                            height="1px"
                                                            background="rgba(255, 255, 255, 0.2)"
                                                        />
                                                    )}
                                                    <PlaybackHistoryItem data={item} />
                                                </React.Fragment>
                                            ))}
                                            <div ref={historyEndRef}>
                                                <Text
                                                    marginTop="8px"
                                                    width="100%"
                                                    opacity="0.45"
                                                    textAlign="center"
                                                    onClick={incrementVisibleItems}
                                                >
                                                    {visibleHistoryCount < friendsListenershipData.length ||
                                                    !friendsListenershipIsLastPage
                                                        ? "Load more?"
                                                        : friendsListenershipData.length > 15
                                                        ? endOfHistoryMessage
                                                        : ""}
                                                </Text>
                                            </div>
                                        </>
                                    )}
                                </Stack>
                            </Stack>
                        )}
                    </>
                )}
                {/* Other pages rendered similarly */}
            </Box>
        </>
    );
}