import { useState, useRef, useEffect } from "react";
import { Box, VStack, Text, Image, IconButton, Progress } from "@chakra-ui/react";
import { FaHeart, FaRegHeart, FaCheckCircle } from "react-icons/fa"; // Replace FaMusic with FaCheckCircle
import { useDrag } from "react-use-gesture";
import { motion, AnimatePresence } from "framer-motion";
import { FastAverageColor } from "fast-average-color";
import { formatHex, oklch } from "culori";
import { apcach, crToBg } from "apcach";
import { getSizedImageUrl } from "@/lib/sized-img";

interface Song {
    id: string;
    title: string;
    artists: string[];
    album: string;
    imageUrl: string;
    likeness: number;
};

const MusicDiscoveryFeed: React.FC<{ songs: Song[] }> = (props) => {
  const { songs } = props;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragY, setDragY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showRefreshMessage, setShowRefreshMessage] = useState(false);
  const refreshTimeout = useRef<NodeJS.Timeout | null>(null);
  const [progress, setProgress] = useState(0);
  const [reactiveDesignColour, setReactiveDesignColour] = useState<string | null>(null);
  const [reactiveDesignComplementaryColour, setReactiveDesignComplementaryColour] = useState<string | null>(null);

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

  const bind = useDrag(({ movement: [, my], velocity, down }) => {
    setDragY(my);

    if (!down) {
      const swipeThreshold = window.innerHeight * 0.3;
      const speedThreshold = 0.5;

      if (my < 0 && (Math.abs(my) > swipeThreshold || Math.abs(velocity) > speedThreshold)) {
        // Only allow moving to the next item when swiping downwards
        setCurrentIndex((prevIndex) => {
            const v = Math.min(prevIndex + 1, songs.length);

            if (!songs[v])
                return v;

            const fac = new FastAverageColor();
            
            fac.getColorAsync(songs[v].imageUrl)
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

                // Check if the color is a shade of white (r, g, b values close to each other and above 100)
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
          {currentIndex < songs.length ? (
            [currentIndex, currentIndex + 1].map((index) => (
              index < songs.length && (
                <motion.div
                  key={songs[index].id}
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
                    <Image
                      src={getSizedImageUrl(songs[index].imageUrl, 280, 280)}
                      width="280px"
                      height="280px"
                      objectFit="cover"
                      draggable="false"
                      marginTop="40px"
                      marginBottom="60px"
                      borderRadius="10px"
                    />
                    <Text fontSize="24px" fontWeight="bold" color={reactiveDesignComplementaryColour ?? "white"} width="80%">
                        {songs[index].title} ({Math.min(Math.round(songs[index].likeness * 100), 100)}%)
                    </Text>
                    <Text fontSize="18px" color={reactiveDesignComplementaryColour ?? "white"} opacity="0.75" width="80%">
                        {songs[index].artists.join(", ")}
                    </Text>
                    <IconButton
                    aria-label="like"
                    icon={<FaRegHeart />}
                    variant="ghost"
                    size="lg"
                    mt={2}
                    />
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
                  You reached the end of your recommendations
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
