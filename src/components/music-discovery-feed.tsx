import { useState, useRef, useEffect } from "react";
import { Box, VStack, Text, Image, IconButton, Progress, HStack, Avatar } from "@chakra-ui/react";
import { FaHeart, FaRegHeart, FaCheckCircle } from "react-icons/fa"; // Replace FaMusic with FaCheckCircle
import { useDrag } from "react-use-gesture";
import { motion, AnimatePresence } from "framer-motion";
import { FastAverageColor } from "fast-average-color";
import { formatHex, oklch } from "culori";
import { apcach, crToBg } from "apcach";
import confetti from "canvas-confetti";

import { getSizedImageUrl } from "@/lib/sized-img";
import User, { FeedItem, FeedItemAlert, FeedItemHistory } from "@/lib/usrlib";
import { SkeletonImage } from "./playback-state";

export interface Song {
  id: string;
  title: string;
  artists: string[];
  album: string;
  imageUrl: string;
  likeness: number;
};

const MusicDiscoveryFeed: React.FC<{ user: User; feed: FeedItem[]; loadMore: (index: number) => void }> = ({ user, feed, loadMore }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragY, setDragY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showRefreshMessage, setShowRefreshMessage] = useState(false);
  const refreshTimeout = useRef<NodeJS.Timeout | null>(null);
  const [progress, setProgress] = useState(0);
  const [loadingScrollOffset, setLoadingScrollOffset] = useState<number>(0);
  const [reactiveDesignColour, setReactiveDesignColour] = useState<string | null>(null);
  const [reactiveDesignComplementaryColour, setReactiveDesignComplementaryColour] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(true);
  const [internalFeed, setInternalFeed] = useState<FeedItem[]>([]);

  const handleRefresh = () => {
    // Placeholder function for refresh logic
    console.log("Refreshing...");
  };

  useEffect(() => {
    let isDragging = false;
    let startY = 0;

    const handleStart = (e: TouchEvent | MouseEvent) => {
      isDragging = true;
      startY = e instanceof TouchEvent ? e.touches[0].clientY : e.clientY;
    };

    const handleMove = (e: TouchEvent | MouseEvent) => {
      if (!isDragging) return;

      const currentY = e instanceof TouchEvent ? e.touches[0].clientY : e.clientY;
      const deltaY = currentY - startY;

      if (deltaY > 20 && window.scrollY === 0) {
        e.preventDefault(); // Prevent upward scrolling
        setShowRefreshMessage(true);

        if (!refreshTimeout.current) {
          const updateProgress = () => {
            setProgress((prev) => {
              if (prev >= 100) {
                handleRefresh();
                setShowRefreshMessage(false);
                setProgress(0);
                refreshTimeout.current = null;
                return 0;
              }
              refreshTimeout.current = setTimeout(updateProgress, 20); // Smooth updates
              return prev + 1;
            });
          };
          updateProgress();
        }
      } else {
        setShowRefreshMessage(false);
        setProgress(0);
        if (refreshTimeout.current) {
          clearTimeout(refreshTimeout.current);
          refreshTimeout.current = null;
        }
      }
    };

    const handleEnd = () => {
      isDragging = false;
      setShowRefreshMessage(false);
      setProgress(0);
      if (refreshTimeout.current) {
        clearTimeout(refreshTimeout.current);
        refreshTimeout.current = null;
      }
    };

    document.addEventListener("touchstart", handleStart, { passive: false });
    document.addEventListener("touchmove", handleMove, { passive: false });
    document.addEventListener("touchend", handleEnd);
    document.addEventListener("mousedown", handleStart);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleEnd);

    return () => {
      document.removeEventListener("touchstart", handleStart);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("mousedown", handleStart);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleEnd);
    };
  }, []);

  const processReactiveColoursFromImage = (imageUrl: string) => {
    const fac = new FastAverageColor();

    fac.getColorAsync(imageUrl)
    .then(color => {
      setReactiveDesignColour(color.rgb);

      const rgbValues = color.rgb
        .match(/\d+/g)
        ?.map(Number);

      if (!rgbValues)
        return;

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

      const [r, g, b] = rgbValues;
      let hex = rgbToHex(r, g, b);

      const isShadeOfWhite = Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15 && r > 100 && g > 100 && b > 100;

      if (isShadeOfWhite) {
        setReactiveDesignComplementaryColour("#ffffff");
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
        l: 1,
        c: ideal.chroma,
        h: ideal.hue,
      }));

      const idealRgb = hexToRgb(idealHexPre);
      const idealHex = rgbToHex((idealRgb?.r ?? 0) * colourMultiplier, (idealRgb?.g ?? 0) * colourMultiplier, (idealRgb?.b ?? 0) * colourMultiplier);

      setReactiveDesignComplementaryColour(idealHex);
    })
    .catch(e => {
        console.log(e);
    });
  };

  useEffect(() => {
    setCurrentIndex(0 + loadingScrollOffset);
    setLoadingScrollOffset(0);
    setInternalFeed(feed);
    setLoadingMore(false);
  }, [feed]);
  
  useEffect(() => {
    const current = internalFeed[currentIndex];

    // If this is an alert, mark it viewed
    if (current && current.type == "alert")
      user.markFYPAlertViewed((current.data as FeedItemAlert).id);

    console.log(internalFeed[currentIndex])

    if (!current)
      return;

    if (
      typeof window !== "undefined" &&
      current &&
      current.type === "alert" &&
      (current.data as FeedItemAlert).alertType === "ListenerTypeChange"
    ) {
      console.log("confetti")
      confetti({
        particleCount: 550,
        spread: 160,
        origin: { y: 0.4 },
        startVelocity: 90,
        ticks: 600,
        gravity: 2.5,
      });
    }
  }, [currentIndex, internalFeed]);

  const bind = useDrag(({ movement: [, my], velocity, down }) => {
    if (loadingMore) {
      setDragY(my);

      if (!down && currentIndex + 1 >= internalFeed.length) {
        setDragY(0);
        return;
      }

      if (!down)
        setLoadingScrollOffset(prev => prev + 1);
    }

    setDragY(my);

    if (!down) {
      const swipeThreshold = window.innerHeight * 0.3;
      const speedThreshold = 0.5;

      if (my < 0 && (Math.abs(my) > swipeThreshold || Math.abs(velocity) > speedThreshold)) {
        // Only allow moving to the next item when swiping downwards
        setCurrentIndex((prevIndex) => {
          const v = Math.min(prevIndex + 1, internalFeed.length);

          if (!internalFeed[v])
            return v;

          if (internalFeed.length - (currentIndex + 1) <= 5 && !loadingMore) {
            console.log("Fetching next discover page", loadingMore);

            setLoadingMore(true);
            loadMore(currentIndex);
          }

          const nextItem = internalFeed[v];

          if (nextItem.type == "discover") {
            const song = nextItem.data as Song;

            processReactiveColoursFromImage(song.imageUrl);
          } else if (nextItem.type === "history") {
            const history = nextItem.data as FeedItemHistory;

            if (history.item.track.album.artUrl) {
                processReactiveColoursFromImage(history.item.track.album.artUrl);
            }
          } else {
            setReactiveDesignColour(null);
            setReactiveDesignComplementaryColour(null);
          }

          return v;
        });
      }
      setDragY(0);
    }
  }, { axis: 'y', rubberband: true });

  return (
    <>
      {showRefreshMessage && (
        <Box
          position="fixed"
          top="-6px"
          left="0"
          width="100vw"
          height="50px"
          backgroundColor="transparent"
          color="white"
          lineHeight="50px"
          zIndex="9999999999999"
          textAlign="right"
          paddingRight="16px"
        >
          Hold to refresh
          <Progress
            size="xs"
            value={progress}
            position="absolute"
            bottom="0"
            width="108px" // Set the width to 320px
            right="16px" // Offset 16px from the right
            borderRadius="md"
            sx={{
              "& > div": {
                backgroundColor: "white", // Set the progress bar foreground color to white
              },
              backgroundColor: "rgba(255, 255, 255, 0.2)", // Set the progress bar background to a translucent white
            }}
          />
        </Box>
      )}
      <VStack spacing={0} align="center" justify="center" pos="fixed" left="0" top="0" height="100vh" width="100vw" ref={containerRef} overflow="hidden">
        <AnimatePresence>
          {currentIndex < internalFeed.length ? (
            [currentIndex, currentIndex + 1].map((index) => (
              index < internalFeed.length && (
                <motion.div
                  key={internalFeed[index].type == "discover" ? (internalFeed[index].data as Song).id : (internalFeed[index].data as FeedItemHistory).userId + (internalFeed[index].data as FeedItemHistory).timestamp}
                  {...bind()}
                  style={{
                    touchAction: "none",
                    cursor: "grab",
                    width: "100vw",
                    height: "100vh",
                    position: "absolute",
                    top: `${(index - currentIndex) * 100}%`,
                  }}
                  initial={{ y: (index - currentIndex) * window.innerHeight }}
                  animate={{ y: (index - currentIndex) * window.innerHeight + dragY }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 50 }}
                >
                  <Box
                    width="100vw"
                    height="100vh"
                    pos="absolute"
                    backgroundColor={reactiveDesignColour ?? "gray.700"}
                    textAlign="center"
                    
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    flexDirection="column"
                  >
                    {internalFeed[index].type === "alert" &&
                      (internalFeed[index].data as FeedItemAlert).alertType === "ListenerTypeChange" && (() => {
                        const alert = internalFeed[index].data as FeedItemAlert;
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
                                  filter: "blur(5px) brightness(0.8)",
                                }}
                              >
                                <source src="/assets/video/mdf-audio-addict-bg.mp4" type="video/mp4" />
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
                                  You’ve hit a new listening tier — a sign of your dedication and taste in music!
                                </Text>
                              </VStack>
                            </VStack>
                          </Box>                        
                        );
                      })()
                    }
                    {internalFeed[index].type == "discover" && (<>
                      <Image
                        src={getSizedImageUrl((internalFeed[index].data as Song).imageUrl, 280, 280)}
                        width="280px"
                        height="280px"
                        objectFit="cover"
                        draggable="false"
                        marginTop="40px"
                        marginBottom="60px"
                        borderRadius="10px"
                      />
                      <Text fontSize="24px" fontWeight="bold" color={reactiveDesignComplementaryColour ?? "white"} width="80%">
                          {(internalFeed[index].data as Song).title} ({Math.min(Math.round((internalFeed[index].data as Song).likeness * 100), 100)}%)
                      </Text>
                      <Text fontSize="18px" color={reactiveDesignComplementaryColour ?? "white"} opacity="0.75" width="80%">
                          {(internalFeed[index].data as Song).artists.join(", ")}
                      </Text>
                      <IconButton
                      aria-label="like"
                      icon={<FaRegHeart />}
                      variant="ghost"
                      size="lg"
                      mt={2}
                      />
                    </>)}
                    {internalFeed[index].type === "history" && (() => {
                    const history = internalFeed[index].data as FeedItemHistory;
                    const { username, pfpUrl, item } = history;
                    const { track, sessionDuration, skipped, replayed } = item;

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
                        <Image
                          src={track.album.artUrl}
                          alt={track.name}
                          position="absolute"
                          top="0"
                          left="0"
                          width="100%"
                          height="100%"
                          objectFit="cover"
                          opacity={0.1}
                          filter="grayscale(100%) blur(6px)"
                          zIndex={0}
                        />
                      
                        {/* Foreground content */}
                        <VStack spacing={12} maxW="90%" zIndex={1}>
                          <VStack gap="10px" alignItems="center">
                            {pfpUrl ? (
                              <SkeletonImage
                                width="76px"
                                height="76px"
                                borderRadius="6px"
                                src={getSizedImageUrl(pfpUrl ?? "null", 76, 76)}
                                onError={() => { }}
                              />
                            ) : (
                              <Avatar
                                name={username ?? "" + history.userId ?? ""}
                                borderRadius="6px"
                                width="76px"
                                height="76px"
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
                      
                          <HStack spacing={6} pt={4} fontSize="sm" color="gray.500" wrap="wrap" justifyContent="center">
                            <Text>
                              {(() => {
                                const totalSeconds = Math.floor((sessionDuration * track.duration) / 1000);
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
                        </VStack>
                      </Box>
                    );
                })()}
                  </Box>
                </motion.div>
              )
            ))
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
                padding: "20px",
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
    </>
  );
};

export default MusicDiscoveryFeed;
