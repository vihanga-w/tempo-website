import { useState, useRef, useEffect } from "react";
import { Box, VStack, Text, Image, IconButton, Progress } from "@chakra-ui/react";
import { FaHeart, FaRegHeart } from "react-icons/fa";
import { useDrag } from "react-use-gesture";
import { motion, AnimatePresence } from "framer-motion";

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

      if (deltaY > 0 && deltaY < 50 && window.scrollY === 0) {
        e.preventDefault(); // Prevent upward scrolling
        setShowRefreshMessage(true);

        if (!refreshTimeout.current) {
          refreshTimeout.current = setInterval(() => {
            setProgress((prev) => {
              if (prev >= 100) {
                clearInterval(refreshTimeout.current!);
                refreshTimeout.current = null;
                handleRefresh();
                setShowRefreshMessage(false);
                return 0;
              }
              return prev + 5;
            });
          }, 100);
        }
      } else {
        setShowRefreshMessage(false);
        setProgress(0);
        if (refreshTimeout.current) {
          clearInterval(refreshTimeout.current);
          refreshTimeout.current = null;
        }
      }
    };

    const handleEnd = () => {
      isDragging = false;
      setShowRefreshMessage(false);
      setProgress(0);
      if (refreshTimeout.current) {
        clearInterval(refreshTimeout.current);
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
        setCurrentIndex((prevIndex) => Math.min(prevIndex + 1, songs.length - 1));
      }
      setDragY(0);
    }
  }, { axis: 'y', rubberband: true });

  return (
    <>
      {showRefreshMessage && (
        <Box
          position="fixed"
          top="0"
          left="0"
          width="100vw"
          height="50px"
          backgroundColor="gray.800"
          color="white"
          textAlign="center"
          lineHeight="50px"
          zIndex="1000"
        >
          Hold to refresh...
          <Progress
            size="xs"
            colorScheme="teal"
            value={progress}
            position="absolute"
            bottom="0"
            width="100%"
          />
        </Box>
      )}
      <VStack spacing={0} align="center" justify="center" pos="fixed" left="0" top="0" height="100vh" width="100vw" ref={containerRef} overflow="hidden">
        <AnimatePresence>
          {[currentIndex, currentIndex + 1].map((index) => (
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
                  backgroundColor="gray.700"
                  textAlign="center"
                  position="relative"
                >
                  <Image
                    src={songs[index].imageUrl}
                    width={{ base: "100%", md: "80%" }}
                    height={{ base: "100%", md: "80%" }}
                    objectFit="cover"
                    draggable="false"
                    mx="auto"
                  />
                  <Box position="absolute" bottom={0} left={0} right={0} textAlign="center" backgroundColor="rgba(0,0,0,0.5)" p={4}>
                    <Text fontSize="lg" fontWeight="bold" color="white">
                      {songs[index].title} ({Math.min(Math.round(songs[index].likeness * 100), 100)}%)
                    </Text>
                    <Text fontSize="md" color="gray.300">
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
                </Box>
              </motion.div>
            )
          ))}
        </AnimatePresence>
      </VStack>
    </>
  );
};

export default MusicDiscoveryFeed;
