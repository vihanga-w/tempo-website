import PageRouter from "@/lib/page-router";
import User, { FeedItem, FeedItemAlert, FriendListenershipItem } from "@/lib/usrlib";
import {
    Text,
    Box,
    HStack,
    useDisclosure,
    Stack,
    Center,
    Spinner
} from "@chakra-ui/react";
import { useEffect, useRef, useState, useCallback } from "react";
import React, { lazy, Suspense } from "react";
import GlassActionMenu from "./glass-action-menu";
import { PlaybackState } from "./playback-state";
import { History, Settings as SettingsIcon } from "lucide-react";
import { GlassTopBar } from "./glass-top-bar";
import { Loader } from "./loader";
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
const LeaderboardPage = lazy(() => import("./leaderboard-page"));
const AddFriendsPage = lazy(() => import("./add-friends-page"));
const ProfilePage = lazy(() => import("./profile-page"));
const PassportPage = lazy(() => import("./passport-page"));
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

export default React.memo(function UIApp({
    prouter,
    user,
}: Readonly<{
    prouter: PageRouter,
    user: User,
}>) {
    // console.log("UI MOUNTED", prouter, user);
    
    // Defaults follow the first visible entry in `pages` below — update both if
    // Discover or For You are restored
    const [currentPage, setCurrentPage] = useState<string>("friends");
    const [currentPageTitle, setCurrentPageTitle] = useState<string>("Friends");
    const [prevPage, setPrevPage] = useState<string>("");
    const [actionMenuOpen, setActionMenuOpen] = useState<boolean>(false);
    /*
     * The recaps the profile page has found, if any, so the shell can pin a
     * "View Recap" button above the menu while that page is showing. The page
     * owns the fetch; this only hears about the result.
     */
    const [profileRecaps, setProfileRecaps] = useState<{ daily: Recap | null; weekly: Recap | null } | null>(null);
    /*
     * The colours of the song a profile page is showing, for the floating
     * controls' halo. Set by whichever profile is on screen, and cleared by it
     * when it goes; every other page leaves it empty.
     */
    const [pagePalette, setPagePalette] = useState<string[] | null>(null);
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

    // Resuming fires focus, pageshow and visibilitychange together, and each one
    // used to run the reconnect check independently — so a single resume tore the
    // socket down two or three times over, each teardown blanking the activity
    // list and refilling it. This collapses a burst into one check.
    const resumeCheckInFlight = useRef<boolean>(false);

    // Mirrors livePlaybackStates for the socket callbacks and the resume check,
    // which need to know whether anything is currently on screen without being
    // re-created (and re-subscribed) every time the list changes.
    const livePlaybackStatesRef = useRef<UpdateEvent[]>([]);

    useEffect(() => {
        livePlaybackStatesRef.current = livePlaybackStates;
    }, [livePlaybackStates]);

    const { isOpen: isReactionDrawerVisible, onOpen: openReactionDrawer, onClose: closeReactionDrawer } = useDisclosure();
    const { isOpen: isRecapDrawerVisible, onOpen: openRecapDrawer, onClose: closeRecapDrawer } = useDisclosure();

    const setStatusBarColour = (colour: string) => {
        const themeColour = document.querySelector("meta[name=theme-color]");
        themeColour?.setAttribute("content", colour);
    }

    const [lstart] = useState<number>(Date.now());

    // async function updateFriendsListenershipHistory(index?: number) {
    //     // Use passed index or fallback to state
    //     const pageIndex = index ?? friendsListenershipPage;
    //     const res = await user.getFriendsListenershipHistory(pageIndex);

    //     const d = res.d;

    //     setEndOfHistoryMessage(generateEndOfHistoryMessage());
    //     setFriendsListenershipIsLastPage(res.l);
    //     setFriendsListenershipIsError(res.e);

    //     setFriendsListenershipData(prev => {
    //         if (prev.length >= 1) {
    //             if (!prev[0])
    //                 return d;

    //             if (!d[0])
    //                 return [];

    //             // Check if same data
    //             // TODO: Need to implement a hash as this check isn't foolproof
    //             if (prev[0].timestamp + prev[0].item.sessionDuration == d[0].timestamp + d[0].item.sessionDuration)
    //                 return prev;

    //             console.log(prev[prev.length - 1].timestamp, d[0].timestamp, prev[prev.length - 1].timestamp <= d[0].timestamp);

    //             if (prev[prev.length - 1].timestamp <= d[0].timestamp)
    //                 return [...prev, ...d];

    //             return prev;
    //         }

    //         return d;
    //     });
    // };

    const fetchRecaps = async () => {
        try {
            const recaps = await user.getRecaps();

            console.log(dailyRecap?.id, recaps.daily?.id, isRecapDrawerVisible);

            if (dailyRecap?.id !== recaps.daily?.id)
                setDailyRecap(recaps.daily);

            if (weeklyRecap?.id !== recaps.weekly?.id)
                setWeeklyRecap(recaps.weekly);

            if (!isRecapDrawerVisible && (recaps.daily || recaps.weekly))
                openRecapDrawer();
        } catch (ex) {
            console.error("Failed to fetch latest user recaps, error:", ex);
        }
    };

    useEffect(() => {
        prouter.on("set-main-page", (p: string) => {
            // No hardcoded previous page: "activity" is hidden, and recording it
            // meant the back control tried to return to a page that no longer
            // exists
            pageChanger(p);
        });

        if (user.isLoggedIn) {
            // Refresh every 30 sec
            const intervalId = setInterval(fetchRecaps, 30e3);

            return () => clearInterval(intervalId);
        }
    }, [user.isLoggedIn]);

    useEffect(() => {
        if (!isRecapDrawerVisible) {
            setDailyRecap(null);
            setWeeklyRecap(null);
        }
    }, [isRecapDrawerVisible]);

    // useEffect(() => {
    //     // When friendsListenershipData is refreshed, reset the visible count
    //     setVisibleHistoryCount(
    //         friendsListenershipPage === 0
    //             ? ITEMS_PER_BATCH
    //             : (prevCount) => Math.min(prevCount + ITEMS_PER_BATCH, friendsListenershipData.length)
    //     );
    // }, [friendsListenershipData, friendsListenershipPage]);

    // const incrementVisibleItems = () => {
    //     // Only paginate if we reach end of array
    //     if (visibleHistoryCount + ITEMS_PER_BATCH > friendsListenershipData.length && !friendsListenershipIsLastPage) {
    //         setFriendsListenershipPage(p => {
    //             const newPage = p + 1;
    //             updateFriendsListenershipHistory(newPage);
    //             return newPage;
    //         });
    //     } else {
    //         setVisibleHistoryCount((prevCount) =>
    //             Math.min(prevCount + ITEMS_PER_BATCH, friendsListenershipData.length)
    //         );
    //     }
    // };

    // Intersection Observer to load more items as the sentinel comes into view
    // useEffect(() => {
    //     if (!historyEndRef.current) return;

    //     const observer = new IntersectionObserver(
    //         (entries) => {
    //             console.log(entries, entries[0].isIntersecting);
    //             if (entries[0].isIntersecting)
    //                 incrementVisibleItems();
    //         },
    //         {
    //             root: null,
    //             threshold: 0.1,
    //         }
    //     );

    //     observer.observe(historyEndRef.current);
        
    //     return () => {
    //         if (historyEndRef.current) {
    //             observer.unobserve(historyEndRef.current);
    //         }
    //     };
    // }, [friendsListenershipData, historyEndRef]);

    useEffect(() => {
        // Extra actions to perform when page switched
        if (currentPage == "activity") {
            // Refresh friends listenership history data
            // updateFriendsListenershipHistory();
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
            // Only hide while there is nothing worth looking at. On a reconnect
            // the previous states stay on screen until "open" replaces them,
            // rather than collapsing to placeholders and popping back.
            if (livePlaybackStatesRef.current.length === 0)
                setShowLivePlaybackStates(false);
            
            newStreamer.fetchFriendsStreams()
            .then(s => {
                if (s.includes(user.id))
                    s.splice(s.indexOf(user.id), 1);
                
                setLivePlaybackStatesPlaceholderCount(s.length);
            });
        });

        newStreamer.on("handshake", () => {
            setActivityPageLoading(false);

            console.log("Load complete, took", Date.now() - lstart, "ms");
        });

        newStreamer.on("open", async () => {
            const states = await newStreamer.queryRemoteLastStates();

            // Convert the last states into update events
            const updates = states.map(v => {
                if (!v)
                    return null;

                // Ignore if last state was longer than the duration of the song ago
                if (Date.now() >= v.updatedAt + v.timeRemaining - 2500)
                    return null;

                const converted: UpdateEvent = {
                    userId: v.userId,
                    data: {
                        state: v,
                        action: {
                            type: v.isPlaying ? "PLAYING" : "PAUSED",
                            songId: v.songId
                        },
                        interpolatedProgress: v.progressNormal
                    }
                };

                return converted;
            }).filter(v => v !== null) as UpdateEvent[];

            setLivePlaybackStatesPlaceholderCount(updates.filter(v => v.userId !== user.id).length);
            setLivePlaybackStates(updates);
        });

        newStreamer.on("update", (data: UpdateEvent) => {
            updateMutex.runExclusive(() => {
                // console.log(data)
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
        // updateFriendsListenershipHistory();

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

                console.log(data)

                return [...(prev.slice(currentFYPPageIndex.t + 1, prev.length)), ...(data ?? [])];
            });
        })
        .catch(ex => {
            console.error("Failed to fetch user FYP, error:", ex);
        });
    }, [currentFYPPageIndex]);

    useEffect(() => {
        const handleFocus = async () => {
            if (resumeCheckInFlight.current)
                return;

            resumeCheckInFlight.current = true;

            try {
                await runResumeCheck();
            } finally {
                // Held briefly after the check rather than released immediately:
                // the events do not always arrive together, and offline the
                // version fetch rejects fast enough that a plain in-flight flag
                // lets the next one straight through.
                setTimeout(() => {
                    resumeCheckInFlight.current = false;
                }, 1e3);
            }
        };

        const runResumeCheck = async () => {
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

            // A socket still negotiating is not a dead socket: tearing it down
            // restarts the very connection it was about to complete.
            if (streamer && !streamer.isReady() && !streamer.isConnecting()) {
                // The list is deliberately left alone. Reconnecting replaces it
                // wholesale on "open", so clearing it here only guarantees a gap
                // where the activity page shows nothing at all.
                if (livePlaybackStatesRef.current.length === 0)
                    setActivityPageLoading(true);

                setStreamerReset(true);
            }
            // Pass the current friendsListenershipPage explicitly
            // updateFriendsListenershipHistory(friendsListenershipPage);
        };

        // `focus` alone is not enough for an installed PWA. Swiping the app away
        // without closing it and reopening it restores the page without ever
        // firing focus on some platforms, and iOS may serve it from the back
        // /forward cache, which fires `pageshow` instead. Listening to all three
        // means a resumed app notices its socket died and reconnects, rather
        // than sitting on a dead connection showing stale playback.
        const handleVisibility = () => {
            if (document.visibilityState === "visible")
                handleFocus();
        };

        window.addEventListener("focus", handleFocus);
        window.addEventListener("pageshow", handleFocus);
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            window.removeEventListener("focus", handleFocus);
            window.removeEventListener("pageshow", handleFocus);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [streamer]);

    useEffect(() => {
        console.log("uifsc", livePlaybackStates, livePlaybackStatesPlaceholderCount);
        if (
            livePlaybackStates.filter(v => v.userId !== user.id).length === livePlaybackStatesPlaceholderCount &&
            !showLivePlaybackStates
        ) {
            setTimeout(() => {
                setShowLivePlaybackStates(true);
            }, 120);
            fetchRecaps();
        }
    }, [livePlaybackStates, livePlaybackStatesPlaceholderCount, showLivePlaybackStates]);

    useEffect(() => {
        // Gated on an empty list until now, which only ever held while the resume
        // handler was blanking it. init() runs its own cleanup, so calling
        // cleanup() here as well tore the socket down twice per reconnect.
        if (streamerReset && streamer) {
            streamer.init();
            setStreamerReset(false);
        }
    }, [streamer, streamerReset]);

    const pages: { name: string; menuName?: string; id: string; indexed: boolean }[] = [
        {
            // Landing page. First, because the first indexed page is also where
            // a stale page id falls back to.
            name: "Friends",
            id: "friends",
            indexed: true,
        },
        {
            // Back now that its taste picks come from the song model, which
            // describes every song anybody here plays.
            name: "Discover",
            id: "discover",
            indexed: true,
        },
        {
            // Friends' activity with a few recommendations mixed in. Hidden with
            // Discover because it needed the same taste picks, and back with it.
            name: "For You",
            id: "activity",
            indexed: true,
        },
        {
            name: "Leaderboard",
            id: "leaderboard",
            indexed: true,
        },
        {
            name: "Passport",
            id: "passport",
            indexed: true,
        },
        {
            name: "Playlists",
            id: "playlists",
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

        // Fall back rather than throw. A missing page id is a routing mistake,
        // not a reason to take down the whole app — and hiding a page (Discover,
        // For You) leaves exactly this kind of stale reference behind.
        if (!exists) {
            const fallback = pages.find(v => v.indexed);

            console.warn(`No page with id "${id}"; falling back to "${fallback?.id ?? "none"}"`);

            if (!fallback)
                return;

            id = fallback.id;
            title = fallback.name;
        }
        
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

    /*
     * The title used to open a page switcher. Getting around is the action
     * button's job now, so the only thing left for the title to do is take a
     * sub-page back to where it was opened from.
     */
    const handleBack = useCallback(() => {
        if (prevPage !== "") pageChanger(prevPage);
    }, [prevPage, pageChanger]);

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
            <Box width="100%" opacity={isRecapDrawerVisible ? 0 : 1} pointerEvents={isRecapDrawerVisible ? "none" : "all"}>
                <GlassTopBar scrolled={hideTopGradient} />

                <HStack
                    width="100%"
                    height="100%"
                    marginLeft="0"
                    marginRight="0"
                    marginTop="-15px"
                    marginBottom="48px"
                    paddingTop="20px"
                    paddingLeft="20px"
                    paddingRight="20px"
                    opacity={(dailyRecap || weeklyRecap || (currentPage == "activity" && activityPageLoading)) ? 0 : 1}
                >
                    <Box position="fixed" overflow="hidden" zIndex={(isReactionDrawerVisible || isRecapDrawerVisible) ? "999" : "999999999"} top="env(safe-area-inset-top)">
                        {/*
                          * Just the title. It used to open a page switcher, then
                          * to carry the way back from a sub-page; the button at
                          * the bottom-right does both of those now.
                          */}
                        <HStack gap="10px">
                            <Text
                                fontFamily="Libre Franklin"
                                fontWeight="black"
                                fontStyle="italic"
                                fontSize="36px"
                                color={complementaryColour ?? "text.color"}
                                zIndex="10"
                                transition=".3s"
                                whiteSpace="nowrap"
                            >
                                {currentPageTitle}
                            </Text>
                        </HStack>
                    </Box>
                </HStack>

                {/*
                  * Adding something used to be a small "+" in the top-right
                  * corner, which could only ever mean one thing per page and
                  * meant nothing at all on the three pages it was hidden on.
                  *
                  * It is now a glass button at the bottom-right that opens
                  * upwards into everything worth reaching from here, actions
                  * and pages alike, and sits where a thumb already rests.
                  */}
                <GlassActionMenu
                    open={actionMenuOpen}
                    setOpen={setActionMenuOpen}
                    currentPage={currentPage}
                    /*
                     * On a sub-page the button is the way back rather than a
                     * menu. It used to be hidden there, leaving the title's
                     * chevron as the only exit; now it is the exit.
                     */
                    onBack={prevPage !== "" ? handleBack : undefined}
                    /*
                     * The page's own colour — the one its title is set in — for
                     * the glass to reflect. Your Profile sets it from the
                     * artwork; everywhere else it is the app's lavender.
                     */
                    tint={complementaryColour}
                    glow={pagePalette ?? undefined}
                    /*
                     * On your profile, settings: beside the menu button, where
                     * the cog in the profile's header used to be.
                     */
                    beside={currentPage === "settings" ? {
                        id: "settings",
                        label: "Settings",
                        icon: SettingsIcon,
                        run: () => pageChanger("preferences", "settings"),
                    } : undefined}
                    /*
                     * What you are playing, dropped in from the top while the
                     * menu is open — the old page switcher's card, which slid
                     * up from the bottom before the menu took the bottom over.
                     * Only when there is something playing, as before — and
                     * not when playback has stopped, when the card draws
                     * nothing and would leave an empty pane of glass.
                     */
                    topCard={user.object?.id
                        && streamer?.getPrevState(user.object.id)
                        && streamer.getPrevState(user.object.id)?.data.action.type !== "STOPPED" ? (
                        <PlaybackState
                            key={user.object?.id + "self" + (streamer?.getPrevState(user.object?.id ?? "")?.data.state?.songId ?? "")}
                            stream={streamer}
                            userId={user.object?.id || ""}
                            hideReaction
                            hideSpotifyCallout
                        />
                    ) : undefined}
                    /*
                     * On the profile, the recaps: in place of the history icon
                     * that used to sit in its header, and only when there is a
                     * recap to see — the same rule that icon followed. It does
                     * what the icon did: hands the recaps up and opens the
                     * drawer, which in turn hides the menu.
                     */
                    pinned={currentPage === "settings" && profileRecaps ? {
                        id: "view-recap",
                        label: "View Recap",
                        icon: History,
                        run: () => {
                            if (profileRecaps.daily)
                                setDailyRecap(profileRecaps.daily);

                            if (profileRecaps.weekly)
                                setWeeklyRecap(profileRecaps.weekly);

                            openRecapDrawer();
                        },
                    } : undefined}
                    onNavigate={(id, kind) => {
                        /*
                         * An action is somewhere you are sent and then come
                         * back from, so it remembers where you were rather
                         * than a fixed home: opening Add Friends from the
                         * leaderboard now returns you to the leaderboard.
                         * A page is just where you now are.
                         */
                        pageChanger(id, kind === "action" ? currentPage : undefined);
                    }}
                    hidden={
                        !!dailyRecap
                        || !!weeklyRecap
                        || isRecapDrawerVisible
                    }
                />

                <Box
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
                            ) : (<Box paddingLeft="20px" paddingRight="20px">
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
                            </Box>)}
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
                    {currentPage == "leaderboard" && (
                        <Suspense fallback={<SuspenseSpinner />}>
                            <LeaderboardPage user={user} />
                        </Suspense>
                    )}

                    {currentPage == "passport" && (
                        <Suspense fallback={<SuspenseSpinner />}>
                            <PassportPage user={user} />
                        </Suspense>
                    )}

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
                        <Box paddingLeft="20px" paddingRight="20px">
                            <Suspense fallback={<SuspenseSpinner />}>
                                <CreatePlaylistPage
                                    user={user}
                                    // onComplete={id => {
                                    //     console.log("Added new friend:", id);
                                    // }}
                                />
                            </Suspense>
                        </Box>
                    )}

                    {/* Friends page */}
                    {currentPage == "friends" && (
                        <Suspense fallback={<SuspenseSpinner />}>
                            <Box paddingLeft="20px" width="calc(100% - 20px)">
                                <FriendsPage
                                    user={user}
                                    streamer={streamer}
                                    openPubProfile={(id) => {
                                        setPubProfileUserId(id);
                                        pageChanger("pub-profile", "friends");
                                    }}
                                    openAddFriends={() => pageChanger("add-friends", "friends")}
                                />
                            </Box>
                        </Suspense>
                    )}

                    {/* Add friends page */}
                    {currentPage == "add-friends" && (
                        <Box paddingLeft="20px" paddingRight="20px">
                            <Suspense fallback={<SuspenseSpinner />}>
                                <AddFriendsPage
                                    user={user}
                                    // onComplete={id => {
                                    //     console.log("Added new friend:", id);
                                    // }}
                                />
                            </Suspense>
                        </Box>
                    )}

                    {/* Settings page */}
                    {currentPage == "settings" && (
                        <Suspense fallback={<SuspenseSpinner />}>
                            <ProfilePage
                                user={user}
                                onPaletteChange={setPagePalette}
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
                                onRecapsAvailable={setProfileRecaps}
                                setComplementaryColour={(colour: string) => {
                                    setComplementaryColour(colour);
                                }}
                                streamer={streamer ?? undefined}
                            />
                        </Suspense>
                    )}

                    {/* Settings page */}
                    {currentPage == "preferences" && (<Box paddingLeft="20px" paddingRight="20px">
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
                    </Box>)}

                    {/* Public profile page */}
                    {currentPage == "pub-profile" && (
                        <Suspense fallback={<SuspenseSpinner />}>
                            <ProfilePage
                                user={user}
                                onPaletteChange={setPagePalette}
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
                                streamer={streamer ?? undefined}
                            />
                        </Suspense>
                    )}
                </Box>
            </Box>
        </>
    );
});