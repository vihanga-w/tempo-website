import PageRouter from "@/lib/page-router";
import User, { FeedItem, FeedItemAlert, FriendListenershipItem } from "@/lib/usrlib";
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
import { useEffect, useRef, useState, useCallback } from "react";
import React, { lazy, Suspense } from "react";
import { SmallAddButton } from "./small-add-btn";
import { Loader } from "./loader";
import { PlaybackState } from "./playback-state";
import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import { Mutex } from "async-mutex";
import { API_URL } from "@/lib/const";
import { PlaybackHistoryItem } from "./playback-history-item";
import { UserLookupResult } from "./user-lookup-result";
import RecapDrawer, { Recap } from "./recap-drawer";
import FullLoader from "./full-loader";
import PlaylistsPage from "./playlists-page";
import CreatePlaylistPage from "./create-playlist-page";
import UserPreferencesPage from "./user-preferences-page";

const MusicDiscoveryFeed = lazy(() => import("./music-discovery-feed"));
const FriendsPage = lazy(() => import("./friends-page"));
const AddFriendsPage = lazy(() => import("./add-friends-page"));
const ProfilePage = lazy(() => import("./profile-page"));
const ReactionDrawer = lazy(() => import("./reaction-drawer"));

const updateMutex = new Mutex();

export const SuspenseSpinner = ({
    useNew,
}: {
    useNew?: boolean;
}) => {
    return(<Box
        position="absolute"
        top="0"
        left="0"
        width="100vw"
        height="100vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
    >
        {useNew ? (
            <FullLoader />
        ) : (
            <Spinner size="lg" />
        )}
    </Box>);
}

const generateEndOfHistoryMessage = () => {
    return (Math.random() <= 0.1 ? "~ End of historussy ~" : "You've seen it all! 😉");
};

export default function UIApp({
    prouter,
    user,
}: Readonly<{
    prouter: PageRouter,
    user: User,
}>) {
    const [currentPage, setCurrentPage] = useState<string>("activity");
    const [currentPageTitle, setCurrentPageTitle] = useState<string>("For You");
    const [prevPage, setPrevPage] = useState<string>("");
    const [pageSwitcherActive, setPageSwitcherActive] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [activityPageLoading, setActivityPageLoading] = useState<boolean>(true);
    const [showLivePlaybackStates, setShowLivePlaybackStates] = useState<boolean>(false);
    const [livePlaybackStates, setLivePlaybackStates] = useState<UpdateEvent[]>([]);
    const [livePlaybackStatesPlaceholderCount, setLivePlaybackStatesPlaceholderCount] = useState<number>(user.friendsSessionsCount);
    const [streamer, setStreamer] = useState<DataStreamer | null>(null);
    const [streamerReset, setStreamerReset] = useState<boolean>(false);
    const [hideTopGradient, setHideTopGradient] = useState<boolean>(false);
    const [complementaryColour, setComplementaryColour] = useState<string>("#e9e7fb");
    const [discoveryData, setDiscoveryData] = useState<FeedItem[]>([]);
    const [friendsListenershipData, setFriendsListenershipData] = useState<FriendListenershipItem[]>([]);
    const [friendsListenershipPage, setFriendsListenershipPage] = useState<number>(0);
    const [friendsListenershipIsLastPage, setFriendsListenershipIsLastPage] = useState<boolean>(false);
    const [friendsListenershipIsError, setFriendsListenershipIsError] = useState<boolean>(false);
    const [endOfHistoryMessage, setEndOfHistoryMessage] = useState<string>("You've seen it all! 😉");
    const [pubProfileUserId, setPubProfileUserId] = useState<string>("");
    const [reactionDrawerItem, setReactionDrawerItem] = useState<UpdateEvent["data"]["state"] | undefined>();
    const [friends, setFriends] = useState<User["friends"]>([]);
    const [dailyRecap, setDailyRecap] = useState<Recap | null>(null);
    const [weeklyRecap, setWeeklyRecap] = useState<Recap | null>(null);
    const [currentFYPPageIndex, setCurrentFYPPageIndex] = useState<{
        p: number;  // Page index
        t: number;  // Item index
    } | null>(null);

    // Lazy loading: how many history items to show at first
    const ITEMS_PER_BATCH = 25;
    const [visibleHistoryCount, setVisibleHistoryCount] = useState<number>(ITEMS_PER_BATCH);
    const historyEndRef = useRef<HTMLDivElement | null>(null);

    const { isOpen: isReactionDrawerVisible, onOpen: openReactionDrawer, onClose: closeReactionDrawer } = useDisclosure();
    const { isOpen: isRecapDrawerVisible, onOpen: openRecapDrawer, onClose: closeRecapDrawer } = useDisclosure();

    const setStatusBarColour = (colour: string) => {
        const themeColour = document.querySelector("meta[name=theme-color]");
        themeColour?.setAttribute("content", colour);
    }

    async function updateFriendsListenershipHistory(index?: number) {
        // Use passed index or fallback to state
        const pageIndex = index ?? friendsListenershipPage;
        const res = await user.getFriendsListenershipHistory(pageIndex);

        const d = res.d;

        setEndOfHistoryMessage(generateEndOfHistoryMessage());
        setFriendsListenershipIsLastPage(res.l);
        setFriendsListenershipIsError(res.e);

        setFriendsListenershipData(prev => {
            if (prev.length >= 1) {
                if (!prev[0])
                    return d;

                // Check if same data
                // TODO: Need to implement a hash as this check isn't foolproof
                if (prev[0].timestamp + prev[0].item.sessionDuration == d[0].timestamp + d[0].item.sessionDuration)
                    return prev;

                console.log(prev[prev.length - 1].timestamp, d[0].timestamp, prev[prev.length - 1].timestamp <= d[0].timestamp);

                if (prev[prev.length - 1].timestamp <= d[0].timestamp)
                    return [...prev, ...d];

                return prev;
            }

            return d;
        });
    };

    useEffect(() => {
        prouter.on("set-main-page", (p: string) => {
            pageChanger(p, "activity");
        });

        const fetchRecaps = async () => {
            try {
                const recaps = await user.getRecaps();

                setDailyRecap(recaps.daily);
                setWeeklyRecap(recaps.weekly);
                setPageSwitcherActive(false);

                if (recaps.daily || recaps.weekly)
                    openRecapDrawer();
            } catch (ex) {
                console.error("Failed to fetch latest user recaps, error:", ex);
            }
        }

        fetchRecaps();

        // Refresh every 30 sec
        setInterval(fetchRecaps, 30e3);
    }, []);

    useEffect(() => {
        if (!isRecapDrawerVisible) {
            setDailyRecap(null);
            setWeeklyRecap(null);
        }
    }, [isRecapDrawerVisible]);

    useEffect(() => {
        // When friendsListenershipData is refreshed, reset the visible count
        setVisibleHistoryCount(
            friendsListenershipPage === 0
                ? ITEMS_PER_BATCH
                : (prevCount) => Math.min(prevCount + ITEMS_PER_BATCH, friendsListenershipData.length)
        );
    }, [friendsListenershipData, friendsListenershipPage]);

    const incrementVisibleItems = () => {
        // Only paginate if we reach end of array
        if (visibleHistoryCount + ITEMS_PER_BATCH > friendsListenershipData.length && !friendsListenershipIsLastPage) {
            setFriendsListenershipPage(p => {
                const newPage = p + 1;
                updateFriendsListenershipHistory(newPage);
                return newPage;
            });
        } else {
            setVisibleHistoryCount((prevCount) =>
                Math.min(prevCount + ITEMS_PER_BATCH, friendsListenershipData.length)
            );
        }
    };

    // Intersection Observer to load more items as the sentinel comes into view
    useEffect(() => {
        if (!historyEndRef.current) return;

        const observer = new IntersectionObserver(
            (entries) => {
                console.log(entries, entries[0].isIntersecting);
                if (entries[0].isIntersecting)
                    incrementVisibleItems();
            },
            {
                root: null,
                threshold: 0.1,
            }
        );

        observer.observe(historyEndRef.current);
        
        return () => {
            if (historyEndRef.current) {
                observer.unobserve(historyEndRef.current);
            }
        };
    }, [friendsListenershipData, historyEndRef]);

    useEffect(() => {
        // Extra actions to perform when page switched
        if (currentPage == "activity") {
            // Refresh friends listenership history data
            updateFriendsListenershipHistory();
        } else if (currentPage == "friends") {
            user.refreshDetails()
            .then(() => {
                setFriends(user.friends);
            });
        }
    }, [currentPage]);

    useEffect(() => {
        if (!user.isLoggedIn) return;

        const newStreamer = new DataStreamer(user.storedToken, ["*"]);

        setStreamer(newStreamer);

        newStreamer.on("construct", () => {
            setShowLivePlaybackStates(false);
            
            newStreamer.fetchFriendsStreams()
            .then(s => {
                if (s.includes(user.id))
                    s.splice(s.indexOf(user.id), 1);
                
                setLivePlaybackStatesPlaceholderCount(s.length);
            });
        });

        newStreamer.on("open", () => {
            setActivityPageLoading(false);
        });

        newStreamer.on("update", (data: UpdateEvent) => {
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

        setCurrentFYPPageIndex({
            p: 1,
            t: 0,
        });

        // Fetch friends listenership history
        updateFriendsListenershipHistory();

        setFriends(user.friends);

        return () => {
            newStreamer.cleanup();
        };
    }, [user.isLoggedIn]);

    useEffect(() => {
        if (!currentFYPPageIndex)
            return;

        // Fetch FYP
        user.getMyFYP(currentFYPPageIndex.p, currentPage == "activity" ? "activity" : "discover")
        .then(data => {
            setDiscoveryData(prev => {
                if (currentFYPPageIndex.t == -999)
                    return data;

                return [...(prev.slice(currentFYPPageIndex.t + 1, prev.length)), ...data];
            });
        })
        .catch(ex => {
            console.error("Failed to fetch user FYP, error:", ex);
        });
    }, [currentFYPPageIndex]);

    useEffect(() => {
        const handleFocus = async () => {
            const localVersion = parseInt(window.localStorage.getItem("tempo-local-version") ?? "-1");
            
            try {
                const req = await fetch(API_URL + "/.version");
                const remoteVersion = parseInt(await req.text());

                if (!isNaN(remoteVersion) && (isNaN(localVersion) || localVersion < remoteVersion)) {
                    // Client version is out of date, force ui to refresh
                    window.localStorage.setItem("tempo-local-version", remoteVersion.toString())
                    
                    if (!isNaN(localVersion) && localVersion !== -1)
                        window.location.reload();
                    
                    return;
                }
            } catch {}

            if (streamer && !streamer.isReady()) {
                setActivityPageLoading(true);
                setLivePlaybackStates([]);
                setStreamerReset(true);
            }
            // Pass the current friendsListenershipPage explicitly
            updateFriendsListenershipHistory(friendsListenershipPage);
        };

        window.addEventListener("focus", handleFocus);
        return () => {
            window.removeEventListener("focus", handleFocus);
        };
    }, [streamer, friendsListenershipPage]);

    useEffect(() => {
        console.log("uifsc", livePlaybackStatesPlaceholderCount)
        if (livePlaybackStates.filter(v => v.userId !== user.id).length == livePlaybackStatesPlaceholderCount) {
            setTimeout(() => {
                setShowLivePlaybackStates(true);
            }, 120);
        }
    }, [livePlaybackStates, livePlaybackStatesPlaceholderCount])

    useEffect(() => {
        if (streamerReset && streamer && livePlaybackStates.length == 0) {
            streamer.cleanup();
            streamer.init();
            setStreamerReset(false);
        }
    }, [livePlaybackStates, streamer, streamerReset, livePlaybackStatesPlaceholderCount]);

    const pages: { name: string; menuName?: string; id: string; indexed: boolean }[] = [
        {
            name: "Discover",
            id: "discover",
            indexed: true,
        },
        {
            name: "For You",
            id: "activity",
            indexed: true,
        },
        {
            name: "Playlists",
            id: "playlists",
            indexed: true,
        },
        {
            name: "Friends",
            id: "friends",
            indexed: true,
        },
        {
            name: "Your Profile",
            menuName: "Profile",
            id: "settings",
            indexed: true,
        },
        {
            name: "Settings",
            id: "preferences",
            indexed: false,
        },
        {
            name: "Profile",
            id: "pub-profile",
            indexed: false,
        },
        {
            name: "Add Friends",
            id: "add-friends",
            indexed: false,
        },
        {
            name: "Create Playlist",
            id: "create-playlist",
            indexed: false,
        },
    ];

    const pageChanger = useCallback((id: string, prevPage?: string) => {
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
        
        if (id !== "settings" && id !== "pub-profile")
            setHideTopGradient(false);

        if (id == "activity" || id == "discover") {
            setDiscoveryData([{
                data: {
                    id: "loading",
                    alertType: "ContentLoading",
                    content: "",
                } as FeedItemAlert,
                type: "alert",
            }]);
            setCurrentFYPPageIndex({
                p: 1,
                t: -999,
            });
        } else if (id !== "activity") {
            closeReactionDrawer();
        }

        setStatusBarColour("#0d0d0e");
        setComplementaryColour("#e9e7fb");
        setCurrentPage(id);
        setCurrentPageTitle(title);
        setPrevPage(prevPage ?? "");
    }, [closeReactionDrawer]);

    const handlePageMenuClick = useCallback(() => {
        if (prevPage !== "") return pageChanger(prevPage);
        setPageSwitcherActive(!pageSwitcherActive);
    }, [prevPage, pageSwitcherActive]);

    const ADD_NEW_ITEM_POSSIBLE_PAGES = ["friends", "playlists"];

    return (
        <>
            <RecapDrawer
                open={openRecapDrawer}
                close={closeRecapDrawer}
                isOpen={isRecapDrawerVisible}
                daily={dailyRecap}
                weekly={weeklyRecap}
                user={user}
            />
            <Box
                position="fixed"
                top="0"
                left="0"
                width="100vw"
                height="100vh"
                background="white"
                zIndex={isLoading ? "99999999999999" : "-1"}
                display="flex"
                alignItems="center"
                justifyContent="center"
                opacity={isLoading ? 1 : 0}
                transition="opacity 0.15s ease-out"
            >
                <Loader />
            </Box>

            {/* The main user interface */}
            <Box padding="20px" width="100%" opacity={isRecapDrawerVisible ? 0 : 1} pointerEvents={isRecapDrawerVisible ? "none" : "all"}>
                <Image
                    src="/menu-bg.webp"
                    position="absolute"
                    zIndex="999999998"
                    width="100%"
                    height="100%"
                    top={pageSwitcherActive ? "0px" : "-15px"}
                    left={pageSwitcherActive ? "0px" : "-25px"}
                    overflow="hidden"
                    transition=".3s"
                    userSelect="none"
                    opacity={pageSwitcherActive ? "1" : "0"}
                    style={{
                        WebkitTouchCallout: "none",
                    }}
                    backdropFilter="blur(6px)"
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
                    height="85px"
                    pos="fixed"
                    top="0"
                    left="0"
                    opacity={hideTopGradient ? "0" : "1"}
                    background="linear-gradient(180deg,rgb(13, 13, 14) 15%, rgba(13,13,14,0) 100%)"
                    zIndex="999"
                    pointerEvents="none"
                    marginTop="env(safe-area-inset-top)"
                    transition=".3s"
                />

                <Box
                    width="100vw"
                    height="75px"
                    pos="fixed"
                    top="0"
                    left="0"
                    opacity={!hideTopGradient ? "0" : "1"}
                    style={{ WebkitMask: "linear-gradient(180deg,rgb(0,0,0) 25%, rgba(0,0,0,0) 100%)" }}
                    background="linear-gradient(180deg,rgba(13, 13, 14, 0.2) 0%, rgba(13,13,14,0) 100%)"
                    backdropFilter="blur(12px)"
                    zIndex="999"
                    pointerEvents="none"
                    marginTop="env(safe-area-inset-top)"
                    transition=".3s"
                />

                <HStack
                    width="100%"
                    height="100%"
                    marginLeft="0"
                    marginRight="0"
                    marginTop="-15px"
                    marginBottom="48px"
                    opacity={(dailyRecap || weeklyRecap || (currentPage == "activity" && activityPageLoading)) ? 0 : 1}
                >
                    <Box position="fixed" overflow="hidden" zIndex={(isReactionDrawerVisible || isRecapDrawerVisible) ? "999" : "999999999"} top="env(safe-area-inset-top)">
                        <HStack gap="10px" onClick={handlePageMenuClick}>
                            <Box
                                transform={
                                    pageSwitcherActive
                                        ? "rotate(180deg)"
                                        : prevPage !== ""
                                        ? "rotate(90deg)"
                                        : "rotate(0deg)"
                                }
                                transition=".3s"
                                zIndex="10"
                            >
                                <svg width="30" height="19" viewBox="0 0 30 19" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M15 18.5294C15.4315 18.5294 15.863 18.34 16.1565 17.98L29.534 2.95558C29.8274 2.63352 30 2.21673 30 1.74302C30 0.75785 29.3096 0 28.4119 0C27.9977 0 27.5834 0.189482 27.29 0.492542L15 14.2854L2.71002 0.492542C2.41653 0.189482 2.01957 0 1.58807 0C0.690448 0 0 0.75785 0 1.74302C0 2.21673 0.172631 2.63352 0.466044 2.9745L13.8435 17.98C14.1715 18.34 14.5512 18.5294 15 18.5294Z" fill={complementaryColour} style={{
                                        transition: ".3s"
                                    }} />
                                </svg>
                            </Box>
                            <Text
                                fontFamily="Libre Franklin"
                                fontWeight="black"
                                fontStyle="italic"
                                fontSize="36px"
                                color={complementaryColour ?? "text.color"}
                                zIndex="10"
                                transition=".3s"
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
                        {pages.filter((v) => {
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
                                        color={complementaryColour ?? "text.color"}
                                        zIndex="999999998"
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
                                        {v.menuName ?? v.name}
                                    </Text>
                                </>
                            );
                        })}
                    </VStack>
                    <Box
                        width="100vw"
                        pos="fixed"
                        bottom="0px"
                        left="0px"
                        paddingBottom="52px"
                        paddingLeft="20px"
                        paddingRight="20px"
                        paddingTop="18px"
                        zIndex="999999998"
                        transform={
                            pageSwitcherActive && user.object?.id && streamer?.getPrevState(user.object.id) ?
                            "translateY(0px)" : "translateY(160%)"
                        }
                        opacity={
                            pageSwitcherActive && user.object?.id && streamer?.getPrevState(user.object.id) ?
                            1 : 0
                        }
                        transition="transform .5s, opacity .75s"
                    >
                        <PlaybackState
                            key={user.object?.id + "self" + (streamer?.getPrevState(user.object?.id ?? "")?.data.state?.songId ?? "")}
                            stream={streamer}
                            userId={user.object?.id || ""}
                            hideReaction
                            hideSpotifyCallout
                        />
                    </Box>
                    <Box pos="fixed" zIndex="9999999" top="-6px" right="20px" width="100vw" pointerEvents={prevPage || !ADD_NEW_ITEM_POSSIBLE_PAGES.includes(currentPage) ? "none" : "all"}>
                        <SmallAddButton
                            onClick={() => {
                                if (pageSwitcherActive) return;

                                if (currentPage == "friends") 
                                    pageChanger("add-friends", "friends");

                                if (currentPage == "playlists") 
                                    pageChanger("create-playlist", "playlists");
                            }}
                            isCross={false}
                            scale={prevPage || !ADD_NEW_ITEM_POSSIBLE_PAGES.includes(currentPage) ? 0.65 : 1}
                            opacity={prevPage || !ADD_NEW_ITEM_POSSIBLE_PAGES.includes(currentPage) ? "0" : "1"}
                            active={prevPage == "" || !ADD_NEW_ITEM_POSSIBLE_PAGES.includes(currentPage)}
                        />
                    </Box>
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
                    {currentPage == "activity" && (
                        <>
                            <Suspense fallback={<SuspenseSpinner />}>
                                <ReactionDrawer isOpen={isReactionDrawerVisible} open={openReactionDrawer} close={closeReactionDrawer} item={reactionDrawerItem} />
                            </Suspense>
                            {activityPageLoading ? (
                                <Center pos="absolute" width="100vw" height="100vh" top="0" left="0">
                                    <FullLoader />
                                </Center>
                            ) : (
                                <MusicDiscoveryFeed
                                    user={user}
                                    type="activity"
                                    key={"activity-feed"}
                                    feed={discoveryData}
                                    streamer={streamer}
                                    livePlaybackStatesPlaceholderCount={livePlaybackStatesPlaceholderCount}
                                    livePlaybackStates={livePlaybackStates}
                                    showLivePlaybackStates={showLivePlaybackStates}
                                    openReactionDrawer={openReactionDrawer}
                                    setPubProfileUserId={setPubProfileUserId}
                                    setReactionDrawerItem={setReactionDrawerItem}
                                    pageChanger={pageChanger}
                                    loadMore={(index: number) => {
                                        setCurrentFYPPageIndex(prev => {
                                            return {
                                                p: !prev?.p ? 1 : prev.p + 1,
                                                t: index,
                                            }
                                        });
                                    }}
                                />
                            )}
                        </>
                    )}

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
                                <Suspense fallback={<SuspenseSpinner />}>
                                    <MusicDiscoveryFeed
                                        user={user}
                                        type="discover"
                                        key={"discover-feed"}
                                        streamer={streamer}
                                        feed={discoveryData}
                                        loadMore={(index: number) => {
                                            setCurrentFYPPageIndex(prev => {
                                                return {
                                                    p: !prev?.p ? 1 : prev.p + 1,
                                                    t: index,
                                                }
                                            });
                                        }}
                                    />
                                </Suspense>
                            )}
                        </>
                    )}

                    {/* Playlists page */}
                    {currentPage == "playlists" && (
                        <Suspense fallback={<SuspenseSpinner />}>
                            <PlaylistsPage
                                user={user} 
                                // streamer={streamer}
                                // openPubProfile={(id) => {
                                //     setPubProfileUserId(id);
                                //     pageChanger("pub-profile", "friends");
                                // }}
                            />
                        </Suspense>
                    )}

                    {/* Create playlists page */}
                    {currentPage == "create-playlist" && (
                        <>
                            <Suspense fallback={<SuspenseSpinner />}>
                                <CreatePlaylistPage
                                    user={user}
                                    // onComplete={id => {
                                    //     console.log("Added new friend:", id);
                                    // }}
                                />
                            </Suspense>
                        </>
                    )}

                    {/* Friends page */}
                    {currentPage == "friends" && (
                        <Suspense fallback={<SuspenseSpinner />}>
                            <FriendsPage
                                user={user}
                                streamer={streamer}
                                openPubProfile={(id) => {
                                    setPubProfileUserId(id);
                                    pageChanger("pub-profile", "friends");
                                }}
                            />
                        </Suspense>
                    )}

                    {/* Add friends page */}
                    {currentPage == "add-friends" && (
                        <>
                            <Suspense fallback={<SuspenseSpinner />}>
                                <AddFriendsPage
                                    user={user}
                                    // onComplete={id => {
                                    //     console.log("Added new friend:", id);
                                    // }}
                                />
                            </Suspense>
                        </>
                    )}

                    {/* Settings page */}
                    {currentPage == "settings" && (
                        <Suspense fallback={<SuspenseSpinner />}>
                            <ProfilePage
                                user={user}
                                pageChanger={pageChanger}
                                hideTopGradientCb={(hide: boolean) => {
                                    setHideTopGradient(hide);
                                }}
                                setRecaps={recap => {
                                    if (recap.daily)
                                        setDailyRecap(recap.daily);
                                    
                                    if (recap.weekly)
                                        setWeeklyRecap(recap.weekly);
                                }}
                                openRecapDrawer={openRecapDrawer}
                                setComplementaryColour={(colour: string) => {
                                    setComplementaryColour(colour);
                                }}
                            />
                        </Suspense>
                    )}

                    {/* Settings page */}
                    {currentPage == "preferences" && (
                        <UserPreferencesPage
                            user={user}
                            // streamer={streamer}
                            // pageChanger={pageChanger}
                            // hideTopGradientCb={(hide: boolean) => {
                            //     setHideTopGradient(hide);
                            // }}
                            // setRecaps={() => { }}
                            // openRecapDrawer={() => { }}
                            // setComplementaryColour={(colour: string) => {
                            //     setComplementaryColour(colour);
                            // }}
                        />
                    )}

                    {/* Public profile page */}
                    {currentPage == "pub-profile" && (
                        <Suspense fallback={<SuspenseSpinner />}>
                            <ProfilePage
                                user={user}
                                targetUserId={pubProfileUserId}
                                pageChanger={pageChanger}
                                hideTopGradientCb={(hide: boolean) => {
                                    setHideTopGradient(hide);
                                }}
                                setRecaps={() => { }}
                                openRecapDrawer={() => { }}
                                setComplementaryColour={(colour: string) => {
                                    setComplementaryColour(colour);
                                }}
                            />
                        </Suspense>
                    )}
                </Box>
            </Box>
        </>
    );
}