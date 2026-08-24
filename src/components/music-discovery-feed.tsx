import { useState, useRef, useEffect } from "react";
import {
    Box,
    VStack,
    Text,
    Image,
    IconButton,
    Progress,
    HStack,
    Avatar,
    Stack,
    Spinner
} from "@chakra-ui/react";
import { FaHeart, FaRegHeart, FaPlay, FaPause } from "react-icons/fa";
import { useDrag } from "react-use-gesture";
import { motion, AnimatePresence } from "framer-motion";
import { FastAverageColor } from "fast-average-color";
import { formatHex, oklch } from "culori";
import { apcach, crToBg } from "apcach";
import confetti from "canvas-confetti";

import { getSizedImageUrl } from "@/lib/sized-img";
import User, { FeedItem, FeedItemAlert, FeedItemHistory } from "@/lib/usrlib";
import { getSpotifyDeeplink, PlaybackState, SkeletonImage } from "./playback-state";
import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import { API_URL } from "@/lib/const";

import YoutubeBg from 'youtube-bg-react';
import 'youtube-bg-react/dist/index.css';
import { InitialAvatar } from "./initial-avatar";

export interface Song {
    id: string;
    title: string;
    artists: string[];
    album: string;
    imageUrl: string;
    previewUrl?: string;
    likeness: number;
}

const MusicDiscoveryFeed: React.FC<{
    user: User;
    feed: FeedItem[];
    loadMore: (index: number) => void;
    type: "discover" | "activity";
    showLivePlaybackStates?: boolean;
    livePlaybackStatesPlaceholderCount?: number;
    livePlaybackStates?: UpdateEvent[];
    streamer: DataStreamer | null;
    setPubProfileUserId?: (userId: string) => void;
    pageChanger?: (page: string, returnPage: string) => void;
    setReactionDrawerItem?: (item: UpdateEvent["data"]["state"]) => void;
    openReactionDrawer?: () => void;
}> = ({
    user,
    feed,
    loadMore,
    type,
    showLivePlaybackStates,
    livePlaybackStatesPlaceholderCount = 0,
    livePlaybackStates = [],
    streamer,
    setPubProfileUserId,
    pageChanger,
    setReactionDrawerItem,
    openReactionDrawer,
}) => {
    const activityItemsPerPage = Math.floor((window.innerHeight - 105) / 175);
    const requiredActivityPages = Math.ceil(livePlaybackStatesPlaceholderCount / activityItemsPerPage);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [dragY, setDragY] = useState(0);
    const [swipeX, setSwipeX] = useState(0);
    const [swipingOut, setSwipingOut] = useState(false);
    const [loadingMore, setLoadingMore] = useState<boolean>(false);
    const [internalFeed, setInternalFeed] = useState<FeedItem[]>(
        type == "activity" && livePlaybackStatesPlaceholderCount > 0
            ? Array.from({ length: requiredActivityPages }, () => ({
                  type: "alert",
                  data: {
                      id: "activity",
                      alertType: "ActivityPage",
                      content: "",
                  } as FeedItemAlert,
              }))
            : []
    );
    const [loadingScrollOffset, setLoadingScrollOffset] = useState<number>(0);
    const [pendingSwipeDirection, setPendingSwipeDirection] = useState<"left" | "right" | null>(null);
    const [lastSwipedIndex, setLastSwipedIndex] = useState<number | null>(null);
    const [colorMap, setColorMap] = useState<Record<string, { bg: string; fg: string }>>({});
    const [firstLoad, setFirstLoad] = useState(0);
    
    // Audio preview states
    const [isPlaying, setIsPlaying] = useState(false);
    const [activePreviewUrl, setActivePreviewUrl] = useState<string | undefined>();
    const [backgroundVideoId, setBackgroundVideoId] = useState<string | null>(null);
    const [currentPlayingSong, setCurrentPlayingSong] = useState<string | null>(null);
    const [audioProgress, setAudioProgress] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [audioInitialized, setAudioInitialized] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const swipeRef = useRef({
        swipeX: 0,
        dragY: 0,
        updateLoop: () => {},
    });

    useEffect(() => {
        let frameId: number | null = null;
    
        const update = () => {
            setSwipeX(swipeRef.current.swipeX);
            setDragY(swipeRef.current.dragY);

            frameId = null;
        };
    
        const loop = () => {
            if (frameId == null) {
                frameId = requestAnimationFrame(update);
            }
        };
    
        swipeRef.current.updateLoop = loop;
    }, []);

    // Initialize global audio element after first user interaction
    const initializeAudio = () => {
        if (!audioInitialized) {
            audioRef.current = new Audio();
            audioRef.current.preload = 'none';

            audioRef.current.addEventListener('timeupdate', () => {
                if (audioRef.current) {
                    const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;

                    if (isNaN(progress) || !isFinite(progress)) {
                        return setAudioProgress(0);
                    }

                    // Check if there are 3 seconds remaining
                    if (audioRef.current.duration - audioRef.current.currentTime <= 3) {
                        audioRef.current.volume = ((audioRef.current.duration - audioRef.current.currentTime) / 3);
                    } else {
                        audioRef.current.volume = 1.0;
                    }

                    setAudioProgress(progress);
                }
            });

            audioRef.current.addEventListener('ended', () => {
                setIsPlaying(false);
                setCurrentPlayingSong(null);
                setAudioProgress(0);
            });

            audioRef.current.addEventListener('error', (e) => {
                console.error('Audio error:', e);
                setIsPlaying(false);
                setCurrentPlayingSong(null);
                setAudioProgress(0);
            });

            setAudioInitialized(true);
        }
    };

    // Audio preview functions
    const toggleAudioPreview = async (songId: string, previewUrl: string) => {
        if (!previewUrl) return;

        // Initialize audio on first interaction
        initializeAudio();

        if (!audioRef.current) {
            console.error('Audio element not initialized');
            return;
        }

        if (currentPlayingSong === songId && isPlaying) {
            // Pause current song
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            try {
                setAudioProgress(0);

                // Stop current audio if playing
                if (isPlaying) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = 0;
                }

                console.log("Loading preview for song:", songId, "URL:", previewUrl);

                // Set new source
                audioRef.current.src = previewUrl;
                audioRef.current.currentTime = 0;
                
                setCurrentPlayingSong(songId);
                setIsPlaying(true);

                // Load and play
                await audioRef.current.load();
                await audioRef.current.play();
                
            } catch (error) {
                console.error('Error playing audio:', error);
                setIsPlaying(false);
                setCurrentPlayingSong(null);
                setAudioProgress(0);
                alert("Sorry, this song's preview is not available.");
            }
        }
    };

    // Stop audio when component unmounts
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
                audioRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        setBackgroundVideoId(null);

        const stopPlaying = () => {
            if (!audioRef.current)
                return;

            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setIsPlaying(false);
            setCurrentPlayingSong(null);
            setAudioProgress(0);
        };

        const currItm = internalFeed[currentIndex];

        const getBackgroundVideo = async (songId: string) => {
            const req = await fetch(API_URL + `/audio/musicvideo/${songId}`, {
                headers: {
                    ...(user.getAuthHeaders())
                },
                credentials: "include"
            });

            if (req.status == 404)
                return null;

            const data = await req.json() as {
                error: boolean;
                message?: string;
                videoId?: string;
            };
            
            if (data.error || !data.videoId) {
                console.warn("Failed to fetch background video for song:", songId, data.message);

                return null;
            }

            return data.videoId;
        }

        if (!currItm)
            return setActivePreviewUrl(undefined);

        const songId = (currItm.type === "discover" ? (currItm.data as Song).id : (currItm.data as FeedItemHistory).item ? (currItm.data as FeedItemHistory).item.track.id : null);

        if (songId) {
            getBackgroundVideo(songId)
            .then(videoId => {
                if (!videoId)
                    return setBackgroundVideoId(null);

                console.log("Background video fetched for song:", songId, "Video ID:", videoId);

                setBackgroundVideoId(videoId);
            })
            .catch(err => {
                console.error("Error fetching background video for song:", songId, err);

                setBackgroundVideoId(null);
            });
        }

        const attemptActiveFetchPreview = async (songId: string) => {
            const req = await fetch(API_URL + `/audio/preview/${songId}`, {
                headers: {
                    ...(user.getAuthHeaders())
                },
                credentials: "include"
            });

            if (req.status !== 200)
                return null;

            return (await req.text());
        }

        const initPlayer = (songId: string, previewUrl: string, shouldAutoPlay: boolean) => {
            setCurrentPlayingSong(songId);
            setActivePreviewUrl(previewUrl);
            
            // Only auto-play if user was already playing something
            if (shouldAutoPlay && audioInitialized && audioRef.current) {
                toggleAudioPreview(songId, previewUrl);
            }
        }

        const loadTrackPreview = (songId: string, previewUrl?: string) => {
            if (!previewUrl) {
                // Display state to indicate loading
                const wasPlaying = isPlaying;
                setActivePreviewUrl(undefined);
                
                stopPlaying();

                attemptActiveFetchPreview(songId).then(fetchedPreviewUrl => {
                    if (!fetchedPreviewUrl) {
                        console.warn("No preview URL found for song:", songId);
                        return;
                    }

                    console.log("Preview URL fetched for song:", songId);
                    initPlayer(songId, fetchedPreviewUrl, wasPlaying);
                });
            } else {
                console.log("Loading preview for song:", songId, "URL:", previewUrl);
                const wasPlaying = isPlaying;
                
                stopPlaying();
                initPlayer(songId, previewUrl, wasPlaying);
            }
        }

        if (currItm.type === "discover") {
            const song = currItm.data as Song;
            const previewUrl = song.previewUrl;

            loadTrackPreview(song.id, previewUrl);
        } else if (currItm.type === "history") {
            const historyItem = currItm.data as FeedItemHistory;
            const previewUrl = historyItem.previewUrl;

            loadTrackPreview(historyItem.item.track.id, previewUrl);
        } else {
            // Not a song item, stop playback
            stopPlaying();
            setActivePreviewUrl(undefined);
        }
    }, [currentIndex, internalFeed]);

    useEffect(() => {
        const alertItems = Array.from(
            { length: requiredActivityPages },
            () => ({
                type: "alert" as const,
                data: {
                    id: "activity",
                    alertType: "ActivityPage",
                    content: "",
                } as FeedItemAlert,
            })
        );

        setCurrentIndex(0 + loadingScrollOffset);
        setLoadingScrollOffset(0);
        setInternalFeed(
            firstLoad <= 2 && type == "activity" && currentIndex == 0 && livePlaybackStatesPlaceholderCount > 0
                ? [...(alertItems as FeedItem[]), ...feed]
                : feed
        );
        setFirstLoad(prev => prev + 1);
        setLoadingMore(false);
    }, [feed, livePlaybackStatesPlaceholderCount, requiredActivityPages]);

    useEffect(() => {
        const current = internalFeed[currentIndex];

        if (current?.type === "alert") {
            user.markFYPAlertViewed((current.data as FeedItemAlert).id);

            if ((current.data as FeedItemAlert).alertType === "ListenerTypeChange") {
                confetti({
                    particleCount: 550,
                    spread: 160,
                    origin: { y: 0.4 },
                    startVelocity: 90,
                    ticks: 600,
                    gravity: 2.5
                });
            }
        }
    }, [currentIndex, internalFeed]);

    useEffect(() => {
        feed.forEach(item => {
            if (item.type === "discover") {
                const song = item.data as Song;

                if (!colorMap[song.id]) {
                    processReactiveColoursFromImage(song.imageUrl, song.id);
                }
            }
        });
    }, [feed]);

    const preloadImage = (src: string) => {
        return new Promise<void>((resolve, reject) => {
            const img = new window.Image();
            img.src = src;
            img.onload = () => resolve();
            img.onerror = reject;
        });
    };

    useEffect(() => {
        const preloadNextImages = async () => {
            if (!internalFeed.length) return;
    
            const preloadCount = 3; // number of items to preload ahead
            const tasks: Promise<void>[] = [];
    
            for (let i = 1; i <= preloadCount; i++) {
                const next = internalFeed[currentIndex + i];
                if (!next || next.type !== "discover") continue;
    
                const song = next.data as Song;
                const imgUrl = getSizedImageUrl(song.imageUrl, 280, 280);
    
                tasks.push(preloadImage(imgUrl));
            }
    
            try {
                await Promise.all(tasks);
            } catch (e) {
                console.warn("One or more images failed to preload", e);
            }
        };
    
        preloadNextImages();
    }, [currentIndex, internalFeed]);

    const processReactiveColoursFromImage = (imageUrl: string, id: string) => {
        const fac = new FastAverageColor();
    
        fac.getColorAsync(imageUrl).then(color => {
            const rgbValues = color.rgb.match(/\d+/g)?.map(Number);
            if (!rgbValues) return;
    
            const [r, g, b] = rgbValues;
    
            const componentToHex = (c: number) => {
                const hex = Math.ceil(Math.min(c, 255)).toString(16);
                return hex.length === 1 ? "0" + hex : hex;
            };
    
            const rgbToHex = (r: number, g: number, b: number) =>
                `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
    
            const hex = rgbToHex(r, g, b);
            const isShadeOfWhite = Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && r > 100;
    
            if (isShadeOfWhite) {
                setColorMap(prev => ({
                    ...prev,
                    [id]: { bg: color.rgb, fg: "#ffffff" },
                }));
                return;
            }
    
            const h = oklch(hex);
    
            // Determine light/dark based on lightness value
            const isBright = (h?.l ?? 0.5) > 0.65;
    
            // If too bright, choose a much darker fg (low lightness)
            let adjustedFgHex: string;
            if (isBright) {
                adjustedFgHex = formatHex(
                    oklch({ mode: "oklch", l: 0.2, c: 0.03, h: h?.h ?? 0 }) // low lightness = dark gray
                );
            } else {
                // Generate complementary color for fg using apcach
                const ideal = apcach(crToBg(hex, 60), h?.c ?? 0, h?.h ?? 0);
                adjustedFgHex = formatHex(
                    oklch({ mode: "oklch", l: 1, c: ideal.chroma, h: ideal.hue })
                );
            }
    
            setColorMap(prev => ({
                ...prev,
                [id]: { bg: color.rgb, fg: adjustedFgHex },
            }));
        }).catch(console.log);
    };

    const songPreferenceUpdateCb = (songId: string, like: boolean, velocity: number) => {
        console.log(
            !like ? "Disliked" : "Liked",
            songId
        );

        const affinity = ((!like ? -1 : 1) * Math.min(5, Math.max(1, Math.log(velocity) * 3.6)));

        user.setSongAffinity(songId, affinity).then((success: boolean) => {
            if (success) {
                console.log("Song preference updated successfully");
            } else {
                alert("Sorry, something went wrong!");
            }
        }).catch((err) => {
            console.error("Error updating song preference:", err);
            alert("Sorry, something went wrong!");
        });
    }

    const isLoading = () => {
        if (
            (
                type == "discover" &&
                feed.length == 1 &&
                feed[0].type == "alert" &&
                (feed[0].data as FeedItemAlert).alertType == "ContentLoading"
            ) || (
                type == "activity" &&
                feed.length > 0 &&
                feed[feed.length - 1].type == "alert" &&
                (feed[feed.length - 1].data as FeedItemAlert).alertType == "ContentLoading"
            )
        ) {
            return true;
        }

        return false;
    }

    const bind = useDrag((state) => {
        const { movement: [mx, my], velocity: vel, down, event } = state;
    
        const vx = Array.isArray(vel) ? vel[0] : 0;
        const vy = Array.isArray(vel) ? vel[1] : 0;
    
        const currentItem = internalFeed[currentIndex];
        const isDiscover = currentItem?.type === "discover";
    
        if (swipingOut || isLoading()) {
            return;
        }
    
        const swipeThreshold = 50;
        const velocityThreshold = 0.2;

        // Reduce sensitivity if swipe starts in the bottom 10% of the screen
        const screenHeight = window.innerHeight;
        const startY = (event as unknown as TouchEvent).touches?.[0]?.clientY ?? 0;
        const isInBottom10Percent = startY > screenHeight * 0.9;

        const adjustedSwipeThreshold = isInBottom10Percent ? swipeThreshold * 2.2 : swipeThreshold;
        const adjustedVelocityThreshold = isInBottom10Percent ? velocityThreshold * 2.2 : velocityThreshold;
    
        const isHorizontal = Math.abs(mx) > Math.abs(my);
        const nextIndex = Math.min(currentIndex + 1, internalFeed.length - 1);
    
        const processNextBatch = () => {
            if (internalFeed.length - nextIndex <= 5 && !loadingMore) {
                setLoadingScrollOffset(0);
                setLoadingMore(true);
                loadMore(currentIndex - 1);
            }
        };
    
        if (isDiscover) {
            if (!down) {
                let direction: "left" | "right" | "up" | "down" | null = null;
    
                if (isHorizontal && (Math.abs(mx) > adjustedSwipeThreshold || Math.abs(vx) > adjustedVelocityThreshold)) {
                    direction = mx > 0 ? "right" : "left";
                } else if (!isHorizontal && (Math.abs(my) > adjustedSwipeThreshold || Math.abs(vy) > adjustedVelocityThreshold)) {
                    direction = my > 0 ? "down" : "up";
                }
    
                if (direction === "down") {
                    setCurrentIndex((prev) => Math.max(prev - 1, 0));
                    swipeRef.current.swipeX = 0;
                    swipeRef.current.dragY = 0;
                    swipeRef.current.updateLoop();
                } else if (direction === "up") {
                    setCurrentIndex((prev) => Math.min(prev + 1, internalFeed.length - 1));
                    swipeRef.current.swipeX = 0;
                    swipeRef.current.dragY = 0;
                    swipeRef.current.updateLoop();
                    processNextBatch();
                } else if (direction === "left" || direction === "right") {
                    songPreferenceUpdateCb((currentItem.data as Song).id, direction === "right", vel);
    
                    setPendingSwipeDirection(direction);
                    setSwipingOut(true);
                    setLastSwipedIndex(currentIndex);
    
                    if (!loadingMore) setLoadingMore(true);
    
                    setTimeout(() => {
                        setCurrentIndex((prev) => Math.min(prev + 1, internalFeed.length - 1));
                        swipeRef.current.swipeX = 0;
                        swipeRef.current.dragY = 0;
                        swipeRef.current.updateLoop();
                        setSwipingOut(false);
                        setPendingSwipeDirection(null);
                    }, 500);
    
                    setTimeout(() => {
                        setLastSwipedIndex(null);
                        setLoadingMore(false);
                        processNextBatch();
                    }, 800);
                } else {
                    swipeRef.current.swipeX = 0;
                    swipeRef.current.dragY = 0;
                    swipeRef.current.updateLoop();
                }
            } else {
                swipeRef.current.swipeX = mx;
                swipeRef.current.dragY = my;
                swipeRef.current.updateLoop();
            }
        } else {
            if (!down) {
                if (my < -adjustedSwipeThreshold || vy < -adjustedVelocityThreshold) {
                    setCurrentIndex(nextIndex);
                    processNextBatch();
                } else if (my > adjustedSwipeThreshold || vy > adjustedVelocityThreshold) {
                    if (currentIndex > 0) {
                        setCurrentIndex((prev) => prev - 1);
                    } else {
                        swipeRef.current.dragY = 0;
                        swipeRef.current.updateLoop();
                    }
                }
                swipeRef.current.dragY = 0;
                swipeRef.current.updateLoop();
            } else {
                swipeRef.current.dragY = my;
                swipeRef.current.updateLoop();
            }
        }
    }, { rubberband: true });    

    useEffect(() => {
        if (loadingMore)
            setLoadingScrollOffset(prev => prev + 1);

        if (lastSwipedIndex !== null && lastSwipedIndex === currentIndex) {
            setLastSwipedIndex(null);
            setPendingSwipeDirection(null);
            setSwipingOut(false);
        }
    }, [currentIndex]);

    // Audio Preview Component
    const AudioPreview: React.FC<{ 
        songId: string; 
        previewUrl?: string; 
        colors: { bg: string; fg: string };
        marginTop?: string;
    }> = ({ songId, previewUrl, colors, marginTop = "16px" }) => {
        if (!previewUrl)
            return null;

        return (
            <VStack spacing={2} marginTop={marginTop}>
                <HStack spacing={3} alignItems="center">
                    <IconButton
                        aria-label={isPlaying ? "Pause preview" : "Play preview"}
                        icon={isPlaying ? <FaPause /> : <FaPlay />}
                        onClick={() => toggleAudioPreview(songId, previewUrl)}
                        size="sm"
                        variant="ghost"
                        color={colors.fg}
                        _hover={{ bg: "rgba(255,255,255,0.1)" }}
                        borderRadius="full"
                    />
                    <Text fontSize="sm" color={colors.fg} opacity="0.8">
                        {isPlaying ? "Playing Preview" : "Preview Available"}
                    </Text>
                </HStack>
                {isPlaying && (
                    <Progress
                        value={audioProgress}
                        size="sm"
                        colorScheme="white"
                        width="200px"
                        bg="rgba(255,255,255,0.2)"
                        sx={{
                            '& > div': {
                                backgroundColor: colors.fg
                            }
                        }}
                    />
                )}
            </VStack>
        );
    };

    return (<>
        {isLoading() && (<Box pos="fixed" top="0" left="0" zIndex="999" width="100vw" height="100vh" backgroundColor="bg.dark" display="flex" alignItems="center" justifyContent="center">
            <Spinner size="lg" />
        </Box>)}
        <VStack
            spacing={0}
            align="center"
            justify="center"
            pos="fixed"
            left="0"
            top="0"
            height="100vh"
            width="100vw"
            overflow="hidden"
        >
            {/* Like and Dislike indicators */}
            <motion.div
                style={{
                    position: "absolute",
                    top: "50%",
                    left: "-20%",
                    transform: "translateY(-50%)",
                    fontSize: "40px",
                    fontWeight: "bold",
                    color: "white",
                    zIndex: 1
                }}
                animate={{
                    left: swipeX > 25 ? `${Math.min(swipingOut ? 100 : (swipeX - 200) / 2, 20)}%` : "-20%",
                    opacity: swipeX > 100 ? Math.min(swipingOut ? 100 : (swipeX - 100) / 100, 1) : 0
                }}
            >
                Like
            </motion.div>
            <motion.div
                style={{
                    position: "absolute",
                    top: "50%",
                    right: "-20%",
                    transform: "translateY(-50%)",
                    fontSize: "40px",
                    fontWeight: "bold",
                    color: "white",
                    zIndex: 1
                }}
                animate={{
                    right: swipeX < -25 ? `${Math.min(swipingOut ? 1000 : (-swipeX - 200) / 2, 20)}%` : "-20%",
                    opacity: swipeX < -100 ? Math.min(swipingOut ? 100 : (-swipeX - 100) / 100, 1) : 0
                }}
            >
                Dislike
            </motion.div>
            <AnimatePresence>
                {currentIndex < internalFeed.length ? (
                    internalFeed.map((item, index) => {
                        if (Math.abs(index - currentIndex) > 1)
                            return null;

                        const isCurrent = index === currentIndex;
                        const isSwipingOutCard = index === lastSwipedIndex;
                        const id = item.type === "discover" ? (item.data as Song).id : `card-${index}`;
                        const colors = colorMap[id] ?? { bg: "gray.700", fg: "white" };

                        return (
                            <motion.div
                                key={`feed-${index}`}
                                {...(isCurrent ? bind() : {})}
                                style={{
                                    touchAction: "none",
                                    cursor: isCurrent ? "grab" : "default",
                                    position: "absolute",
                                    width: "100vw",
                                    height: "100vh",
                                    top: 0,
                                    left: 0,
                                    zIndex: index === currentIndex ? 2 : 1
                                }}
                                initial={{ y: (index - currentIndex) * window.innerHeight }}
                                animate={{
                                    x:
                                        (isCurrent || isSwipingOutCard) && item.type === "discover"
                                            ? pendingSwipeDirection === "left"
                                                ? -window.innerWidth
                                                : pendingSwipeDirection === "right"
                                                ? window.innerWidth
                                                : Math.abs(swipeX) > 100 // Only move horizontally if swipe exceeds threshold
                                                    ? swipeX
                                                    : 0
                                            : 0,
                                    y:
                                        (isCurrent || isSwipingOutCard)
                                            ? item.type === "discover"
                                                ? dragY
                                                : (index - currentIndex) * window.innerHeight
                                            : (index - currentIndex) * window.innerHeight,
                                    rotate:
                                        (isCurrent || isSwipingOutCard) && item.type === "discover"
                                            ? pendingSwipeDirection
                                                ? pendingSwipeDirection === "left"
                                                    ? -25
                                                    : 25
                                                : Math.abs(swipeX) > 100
                                                    ? swipeX / 25
                                                    : 0
                                            : 0,
                                    opacity: isSwipingOutCard ? 0 : 1
                                }}
                                exit={{ opacity: 0 }}
                                transition={{
                                    type: "tween",
                                    ease: "easeInOut",
                                    duration: 0.225,
                                }}
                            >
                                <Box
                                    width="100vw"
                                    height="100vh"
                                    pos="absolute"
                                    backgroundColor={colors.bg}
                                    textAlign="center"
                                    display="flex"
                                    alignItems="center"
                                    justifyContent="center"
                                    flexDirection="column"
                                >
                                    {item.type === "alert" &&
                                        (item.data as FeedItemAlert).alertType === "ActivityPage" && (<Box overflow="auto" display="block" textAlign="left" width="100%" height="100%" background="bg.dark" padding="20px" paddingTop="65px">
                                            <Stack gap="18px" overflowY="auto" width="100%" height="100%" pointerEvents="all" display={livePlaybackStatesPlaceholderCount > 0 || livePlaybackStates.filter(v => v.userId !== user.id).length > 0 ? "flex" : "none"}>
                                                <Text
                                                    fontFamily="arial, helvetica"
                                                    fontWeight="bold"
                                                    fontSize="24px"
                                                    marginBottom="-10px"
                                                >
                                                    Listening Now
                                                </Text>
                                                                                                {!showLivePlaybackStates ? (Array.from({ length: livePlaybackStatesPlaceholderCount }).slice(currentIndex * activityItemsPerPage, (currentIndex * activityItemsPerPage) + activityItemsPerPage).map((_, i) => {
                                                    return (
                                                        <>
                                                            {i !== 0 && (
                                                                <Box
                                                                    width="100%"
                                                                    height="1px"
                                                                    background="rgba(255, 255, 255, 0.2)"
                                                                />
                                                            )}
                                                            <Box>
                                                                <PlaybackState
                                                                    key={"lpspc-" + i}
                                                                    stream={streamer}
                                                                    userId=""
                                                                    isPlaceholder
                                                                />
                                                            </Box>
                                                        </>
                                                    );
                                                })) : (<></>)}
                                                {showLivePlaybackStates ? (livePlaybackStates.filter(v => v.userId !== user.object?.id).slice(currentIndex * activityItemsPerPage, (currentIndex * activityItemsPerPage) + activityItemsPerPage).map((v, i) => {
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
                                                            <Box pos="relative">
                                                                <PlaybackState
                                                                    key={
                                                                        "ps-" +
                                                                        v.userId +
                                                                        data.state?.songId +
                                                                        (data.state?.artists ? "AA" : "ANA")
                                                                    }
                                                                    stream={streamer}
                                                                    userId={v.userId}
                                                                    profileClickCb={() => {
                                                                        if (!setPubProfileUserId || !pageChanger)
                                                                            return;
                                                                        setPubProfileUserId(v.userId);
                                                                        pageChanger("pub-profile", "activity");
                                                                    }}
                                                                    reactionClickCb={(data: UpdateEvent["data"]["state"]) => {
                                                                        if (!setReactionDrawerItem || !openReactionDrawer)
                                                                            return;

                                                                        setReactionDrawerItem(data);
                                                                        openReactionDrawer();
                                                                    }}
                                                                />
                                                            </Box>
                                                        </>
                                                    );
                                                })): (<></>)}
                                                
                                                <Box
                                                    pos="absolute"
                                                    bottom="0"
                                                    left="0"
                                                    textAlign="center"
                                                    width="100%"
                                                    padding="5px"
                                                    paddingBottom="15px"
                                                    color="text.dark"
                                                    opacity="0.25"
                                                    background="bg.dark"
                                                >
                                                    <Text mb={2.5}>
                                                        Keep scrolling to see {currentIndex + 1 == requiredActivityPages ? "friends history" : "more activity"}
                                                    </Text>
                                                </Box>
                                            </Stack>
                                        </Box>
                                    )}

                                    {item.type === "alert" &&
                                        (item.data as FeedItemAlert).alertType === "ListenerTypeChange" && (() => {
                                            const alert = item.data as FeedItemAlert;
                                            const tierName = alert.content ?? "New Tier";

                                            return (
                                                <Box
                                                    width="100%"
                                                    height="100%"
                                                    position="relative"
                                                    overflow="hidden"
                                                    backgroundColor="#0D0D0E"
                                                    display="flex"
                                                    flexDirection="column"
                                                    justifyContent="center"
                                                    alignItems="center"
                                                    padding="32px"
                                                    textAlign="center"
                                                >
                                                    <Box
                                                        position="absolute"
                                                        top={0}
                                                        left={0}
                                                        width="100%"
                                                        height="100%"
                                                        zIndex={0}
                                                        overflow="hidden"
                                                        opacity={0.08}
                                                        pointerEvents="none"
                                                    >
                                                        <video
                                                            autoPlay
                                                            muted
                                                            loop
                                                            playsInline
                                                            style={{
                                                                height: "100%",
                                                                objectFit: "cover",
                                                                filter: "blur(5px) brightness(0.8)"
                                                            }}
                                                        >
                                                            <source
                                                                src="/assets/video/mdf-audio-addict-bg.mp4"
                                                                type="video/mp4"
                                                            />
                                                        </video>
                                                    </Box>

                                                    <VStack spacing={12} maxW="90%" zIndex={1}>
                                                        <VStack gap="4px">
                                                            <Text fontSize="64px">🎉</Text>
                                                            <Text
                                                                fontSize={["md", "lg"]}
                                                                color="gray.400"
                                                                fontWeight="medium"
                                                                textTransform="uppercase"
                                                                letterSpacing="widest"
                                                            >
                                                                Milestone Unlocked
                                                            </Text>
                                                        </VStack>

                                                        <VStack spacing={6}>
                                                            <Text
                                                                fontSize={["4xl", "5xl", "6xl"]}
                                                                fontWeight="black"
                                                                color="white"
                                                                textTransform="uppercase"
                                                                lineHeight="1.1"
                                                            >
                                                                {tierName}
                                                            </Text>

                                                            <Text
                                                                fontSize={["md", "lg"]}
                                                                color="gray.300"
                                                                fontWeight="normal"
                                                                maxW="480px"
                                                            >
                                                                You've hit a new listening tier — a sign of your dedication and taste in music!
                                                            </Text>
                                                        </VStack>
                                                    </VStack>
                                                </Box>
                                            );
                                        })
                                    ()}

                                    {item.type === "discover" && (
                                        <>
                                            <Image
                                                src={getSizedImageUrl((item.data as Song).imageUrl, 280, 280)}
                                                width="280px"
                                                height="280px"
                                                objectFit="cover"
                                                draggable="false"
                                                marginTop="40px"
                                                marginBottom="60px"
                                                borderRadius="10px"
                                                userSelect="none"
                                                pointerEvents="none"
                                            />
                                            <Text
                                                fontSize="24px"
                                                fontWeight="bold"
                                                color={colors.fg}
                                                width="80%"
                                            >
                                                {(item.data as Song).title} ({Math.min(Math.round((item.data as Song).likeness * 100), 100)}%)
                                            </Text>
                                            <Text
                                                fontSize="18px"
                                                color={colors.fg}
                                                opacity="0.75"
                                                width="80%"
                                            >
                                                {(item.data as Song).artists.join(", ")}
                                            </Text>
                                            
                                            {/* Audio Preview for Discover */}
                                            <AudioPreview
                                                songId={(item.data as Song).id}
                                                previewUrl={activePreviewUrl}
                                                colors={colors}
                                            />
                                            
                                            <a
                                                href={getSpotifyDeeplink((item.data as Song).id)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    marginTop: "16px"
                                                }}
                                            >
                                                <HStack>
                                                    <Box>
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,256,256" width="26px" height="26px" fill-rule="nonzero"><g fill={colors.fg} fill-rule="nonzero" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-dasharray="" stroke-dashoffset="0" font-family="none" font-weight="none" font-size="none" text-anchor="none"><g transform="scale(5.12,5.12)"><path d="M25.009,1.982c-12.687,0 -23.009,10.322 -23.009,23.009c0,12.687 10.322,23.009 23.009,23.009c12.687,0 23.009,-10.321 23.009,-23.009c0,-12.688 -10.322,-23.009 -23.009,-23.009zM34.748,35.333c-0.289,0.434 -0.765,0.668 -1.25,0.668c-0.286,0 -0.575,-0.081 -0.831,-0.252c-2.473,-1.649 -6.667,-2.749 -10.167,-2.748c-3.714,0.002 -6.498,0.914 -6.526,0.923c-0.784,0.266 -1.635,-0.162 -1.897,-0.948c-0.262,-0.786 0.163,-1.636 0.949,-1.897c0.132,-0.044 3.279,-1.075 7.474,-1.077c3.5,-0.002 8.368,0.942 11.832,3.251c0.69,0.46 0.876,1.391 0.416,2.08zM37.74,29.193c-0.325,0.522 -0.886,0.809 -1.459,0.809c-0.31,0 -0.624,-0.083 -0.906,-0.26c-4.484,-2.794 -9.092,-3.385 -13.062,-3.35c-4.482,0.04 -8.066,0.895 -8.127,0.913c-0.907,0.258 -1.861,-0.272 -2.12,-1.183c-0.259,-0.913 0.272,-1.862 1.184,-2.12c0.277,-0.079 3.854,-0.959 8.751,-1c4.465,-0.037 10.029,0.61 15.191,3.826c0.803,0.5 1.05,1.56 0.548,2.365zM40.725,22.013c-0.373,0.634 -1.041,0.987 -1.727,0.987c-0.344,0 -0.692,-0.089 -1.011,-0.275c-5.226,-3.068 -11.58,-3.719 -15.99,-3.725c-0.021,0 -0.042,0 -0.063,0c-5.333,0 -9.44,0.938 -9.481,0.948c-1.078,0.247 -2.151,-0.419 -2.401,-1.495c-0.25,-1.075 0.417,-2.149 1.492,-2.4c0.185,-0.043 4.573,-1.053 10.39,-1.053c0.023,0 0.046,0 0.069,0c4.905,0.007 12.011,0.753 18.01,4.275c0.952,0.56 1.271,1.786 0.712,2.738z"></path></g></g></svg>
                                                    </Box>
                                                    <Box fontSize="12px" lineHeight="15px" color={colors.fg}>
                                                        <Text>Play on</Text>
                                                        <Text>Spotify</Text>
                                                    </Box>
                                                </HStack>
                                            </a>
                                        </>
                                    )}

                                    {item.type === "history" && (() => {
                                        const history = item.data as FeedItemHistory;
                                        const { username, pfpUrl, item: histItem } = history;
                                        const { track, sessionDuration, skipped, replayed } = histItem;

                                        return (
                                            <Box
                                                width="100%"
                                                height="100%"
                                                position="relative"
                                                backgroundColor="#0D0D0E"
                                                display="flex"
                                                flexDirection="column"
                                                justifyContent="center"
                                                alignItems="center"
                                                padding="32px"
                                                overflow="hidden"
                                            >
                                                {backgroundVideoId ? (<>
                                                    <Box
                                                        position="fixed"
                                                        top={0}
                                                        left={0}
                                                        width="100vw"
                                                        height="100vh"
                                                        opacity={0.15}
                                                        filter="grayscale(16%) blur(5px)"
                                                        overflow="hidden"
                                                    >
                                                        <iframe
                                                            src={`https://www.youtube.com/embed/${backgroundVideoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${backgroundVideoId}`}
                                                            title="Background Video"
                                                            allow="autoplay; encrypted-media"
                                                            allowFullScreen
                                                            style={{
                                                                position: "absolute",
                                                                top: "50%",
                                                                left: "50%",
                                                                transform: "translate(-50%, -50%)",
                                                                // 16:9 aspect ratio to cover height
                                                                width: "177.78vh",
                                                                height: "100vh",
                                                                pointerEvents: "none",
                                                            }}
                                                        />
                                                    </Box>
                                                </>) : (
                                                    <Image
                                                        src={track.album.artUrl}
                                                        alt={track.name}
                                                        position="absolute"
                                                        top="0"
                                                        left="0"
                                                        width="100%"
                                                        height="100%"
                                                        objectFit="cover"
                                                        opacity={0.075}
                                                        filter="grayscale(32%) blur(3px)"
                                                        zIndex={0}
                                                    />
                                                )}

                                                <VStack spacing={12} maxW="90%" zIndex={1}>
                                                    <VStack gap="10px" alignItems="center">
                                                        {pfpUrl ? (
                                                            <SkeletonImage
                                                                width="76px"
                                                                height="76px"
                                                                borderRadius="6px"
                                                                src={getSizedImageUrl(pfpUrl, 76, 76)}
                                                                colourBlob={history.pfpColourBlob}
                                                                onError={() => {}}
                                                            />
                                                        ) : (
                                                            <InitialAvatar
                                                                userId={history.userId}
                                                                displayName={username}
                                                                borderRadius="6px"
                                                                size="76px"
                                                            />
                                                        )}
                                                        <Text
                                                            fontSize="32px"
                                                            fontWeight="bold"
                                                            color="white"
                                                            letterSpacing="wide"
                                                        >
                                                            {username}
                                                        </Text>
                                                    </VStack>

                                                    <Box>
                                                        <Text
                                                            fontSize={["sm", "md"]}
                                                            color="gray.500"
                                                            fontWeight="medium"
                                                            textTransform="uppercase"
                                                            letterSpacing="wider"
                                                        >
                                                            listened to
                                                        </Text>
                                                        <Text
                                                            fontSize={["3xl", "4xl", "5xl"]}
                                                            fontWeight="black"
                                                            color="white"
                                                            lineHeight="1.1"
                                                            mt={1}
                                                        >
                                                            {track.name}
                                                        </Text>
                                                        <Text
                                                            fontSize={["md", "lg"]}
                                                            color="gray.400"
                                                            fontWeight="medium"
                                                            mt={2}
                                                        >
                                                            {track.artists.map((a) => a.name).join(", ")}
                                                        </Text>
                                                    </Box>

                                                    <VStack>
                                                        <HStack
                                                            spacing={6}
                                                            pt={4}
                                                            fontSize="sm"
                                                            color="gray.500"
                                                            wrap="wrap"
                                                            justifyContent="center"
                                                        >
                                                            <Text>
                                                                {(() => {
                                                                    const totalSeconds = Math.floor(
                                                                        (sessionDuration * track.duration) / 1000
                                                                    );
                                                                    const minutes = Math.floor(totalSeconds / 60);
                                                                    const seconds = totalSeconds % 60;
                                                                    return `${minutes}m ${seconds}s played`;
                                                                })()}
                                                            </Text>
                                                            {skipped && (
                                                                <Text color="red.400" fontWeight="semibold">
                                                                    Skipped
                                                                </Text>
                                                            )}
                                                            {replayed && (
                                                                <Text color="green.400" fontWeight="semibold">
                                                                    Replayed
                                                                </Text>
                                                            )}
                                                        </HStack>
                                                        <Text fontSize="xs" color="gray.600">
                                                            {(() => {
                                                                const now = Date.now();
                                                                const diffMs = now - history.timestamp;
                                                                const diffSeconds = Math.floor(diffMs / 1000);
                                                                const diffMinutes = Math.floor(diffSeconds / 60);
                                                                const diffHours = Math.floor(diffMinutes / 60);
                                                                const diffDays = Math.floor(diffHours / 24);

                                                                if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
                                                                if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
                                                                if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
                                                                return `Just now`;
                                                            })()}
                                                        </Text>
                                                        
                                                        {/* Audio Preview for History */}
                                                        <AudioPreview
                                                            songId={track.id}
                                                            previewUrl={activePreviewUrl}
                                                            colors={{ bg: "#0D0D0E", fg: "#ffffff" }}
                                                            marginTop="8px"
                                                        />
                                                        
                                                        <a
                                                            href={getSpotifyDeeplink((item.data as FeedItemHistory).item.track.id)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{
                                                                marginTop: "12px"
                                                            }}
                                                        >
                                                            <HStack>
                                                                <Box>
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,256,256" width="26px" height="26px" fill-rule="nonzero"><g fill="#ffffff" fill-rule="nonzero" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-dasharray="" stroke-dashoffset="0" font-family="none" font-weight="none" font-size="none" text-anchor="none"><g transform="scale(5.12,5.12)"><path d="M25.009,1.982c-12.687,0 -23.009,10.322 -23.009,23.009c0,12.687 10.322,23.009 23.009,23.009c12.687,0 23.009,-10.321 23.009,-23.009c0,-12.688 -10.322,-23.009 -23.009,-23.009zM34.748,35.333c-0.289,0.434 -0.765,0.668 -1.25,0.668c-0.286,0 -0.575,-0.081 -0.831,-0.252c-2.473,-1.649 -6.667,-2.749 -10.167,-2.748c-3.714,0.002 -6.498,0.914 -6.526,0.923c-0.784,0.266 -1.635,-0.162 -1.897,-0.948c-0.262,-0.786 0.163,-1.636 0.949,-1.897c0.132,-0.044 3.279,-1.075 7.474,-1.077c3.5,-0.002 8.368,0.942 11.832,3.251c0.69,0.46 0.876,1.391 0.416,2.08zM37.74,29.193c-0.325,0.522 -0.886,0.809 -1.459,0.809c-0.31,0 -0.624,-0.083 -0.906,-0.26c-4.484,-2.794 -9.092,-3.385 -13.062,-3.35c-4.482,0.04 -8.066,0.895 -8.127,0.913c-0.907,0.258 -1.861,-0.272 -2.12,-1.183c-0.259,-0.913 0.272,-1.862 1.184,-2.12c0.277,-0.079 3.854,-0.959 8.751,-1c4.465,-0.037 10.029,0.61 15.191,3.826c0.803,0.5 1.05,1.56 0.548,2.365zM40.725,22.013c-0.373,0.634 -1.041,0.987 -1.727,0.987c-0.344,0 -0.692,-0.089 -1.011,-0.275c-5.226,-3.068 -11.58,-3.719 -15.99,-3.725c-0.021,0 -0.042,0 -0.063,0c-5.333,0 -9.44,0.938 -9.481,0.948c-1.078,0.247 -2.151,-0.419 -2.401,-1.495c-0.25,-1.075 0.417,-2.149 1.492,-2.4c0.185,-0.043 4.573,-1.053 10.39,-1.053c0.023,0 0.046,0 0.069,0c4.905,0.007 12.011,0.753 18.01,4.275c0.952,0.56 1.271,1.786 0.712,2.738z"></path></g></g></svg>
                                                                </Box>
                                                                <Box fontSize="12px" lineHeight="15px" color="#ffffff">
                                                                    <Text>Play on</Text>
                                                                    <Text>Spotify</Text>
                                                                </Box>
                                                            </HStack>
                                                        </a>
                                                    </VStack>
                                                </VStack>
                                            </Box>
                                        );
                                    })()}
                                </Box>
                            </motion.div>
                        );
                    })
                ) : (
                    <motion.div
                        key="end-message"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            width: "100vw",
                            height: "100vh",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "gray.700",
                            color: "white",
                            textAlign: "center",
                            padding: "20px"
                        }}
                    >
                        <Box textAlign="center">
                            <Text fontSize="6xl" mb={6}>🎉</Text>
                            <Text fontSize="lg" fontWeight="medium" color="gray.200" mb={2}>
                                You reached the end of your For You page
                            </Text>
                            <Text fontSize="md" color="gray.400">
                                Come back later for more!
                            </Text>
                        </Box>
                    </motion.div>
                )}
            </AnimatePresence>
        </VStack>
    </>);
};

export default MusicDiscoveryFeed;