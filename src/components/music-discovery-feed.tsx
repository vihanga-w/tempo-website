import { useState, useRef } from "react";
import { Box, VStack, Text, Image, IconButton } from "@chakra-ui/react";
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

// const songs: Song[] = [
//   {
//     id: 1,
//     title: "Song One",
//     artist: "Artist A",
//     cover: "https://source.unsplash.com/200x200/?music",
//     liked: false,
//   },
//   {
//     id: 2,
//     title: "Song Two",
//     artist: "Artist B",
//     cover: "https://source.unsplash.com/200x200/?sound",
//     liked: false,
//   },
//   {
//     id: 3,
//     title: "Song Three",
//     artist: "Artist C",
//     cover: "https://source.unsplash.com/200x200/?dj",
//     liked: false,
//   },
// ];

const MusicDiscoveryFeed: React.FC<{ songs: Song[] }> = (props) => {
  const { songs } = props;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [songList, setSongList] = useState<Song[]>(songs);
  const [dragY, setDragY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleLike = (id: string) => {
    setSongList((prevSongs) =>
      prevSongs.map((song) =>
        song.id === id ? { ...song, liked: false } : song
      )
    );
  };

  const bind = useDrag(({ movement: [, my], velocity, down }) => {
    setDragY(down ? my : 0);
    
    if (!down && Math.abs(my) > 150) {
      setCurrentIndex((prevIndex) =>
        my > 0
          ? (prevIndex - 1 + songList.length) % songList.length
          : (prevIndex + 1) % songList.length
      );
    }
  }, { axis: 'y', rubberband: true });

  return (
    <VStack spacing={0} align="center" justify="center" pos="fixed" left="0" top="0" height="100vh" width="100vw" ref={containerRef} overflow="hidden">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={songList[currentIndex].id}
          {...bind()}
          style={{ touchAction: "none", cursor: "grab", width: "100vw", height: "100vh" }}
          initial={{ opacity: 1, y: 0 }}
          animate={{ opacity: 1, y: dragY }}
          exit={{ opacity: 0, y: dragY > 0 ? 500 : -500, transition: { duration: 0.2, ease: "easeInOut" } }}
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
              src={songList[currentIndex].imageUrl}
              width={{ base: "100%", md: "80%" }}
              height={{ base: "100%", md: "80%" }}
              objectFit="cover"
              draggable="false"
              mx="auto"
            />
            <Box position="absolute" bottom={0} left={0} right={0} textAlign="center" backgroundColor="bg.dark" p={4}>
              <Text fontSize="lg" fontWeight="bold" color="white">
                {songList[currentIndex].title} ({Math.min(Math.round(songList[currentIndex].likeness * 100), 100)}%)
              </Text>
              <Text fontSize="md" color="gray.300">
                {songList[currentIndex].artists.join(", ")}
              </Text>
              <IconButton
                aria-label="like"
                icon={<FaRegHeart />}
                onClick={() => toggleLike(songList[currentIndex].id)}
                variant="ghost"
                size="lg"
                mt={2}
              />
            </Box>
          </Box>
        </motion.div>
      </AnimatePresence>
    </VStack>
  );
};

export default MusicDiscoveryFeed;
