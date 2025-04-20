import { getSizedImageUrl } from "@/lib/sized-img";
import { HStack, Text, Image, Stack, Box } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { SkeletonImage } from "./playback-state";

export default function LeaderboardSongItem({
    leaderboardPosition,
    imageUrl,
    title,
    artists,
    playCount,
    fact,
} : Readonly<{
    leaderboardPosition: number;
    imageUrl: string;
    title: string;
    artists: string[];
    playCount: number;
    fact?: string;
}>) {
    const [overflow, setOverflow] = useState<number>(-1);

    const scrollItemRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!scrollItemRef.current)
            return;

        if (scrollItemRef.current.getBoundingClientRect().width <= window.innerWidth - 132)
            return;

        const process = () => {
            if (scrollItemRef.current && overflow <= 0)
                setOverflow(scrollItemRef.current.getBoundingClientRect().width - (window.innerWidth - 152));
            else
                setOverflow(0);
        }

        if (overflow == -1)
            setTimeout(() => { process() }, 2500);

        setTimeout(() => { process() }, 10e3);
    }, [scrollItemRef, overflow]);
    
    return (
        <HStack gap="8px">
            <Text opacity="0.75">{`#${leaderboardPosition}`}</Text>
            <HStack>
                <SkeletonImage width="48px" height="48px" src={getSizedImageUrl(imageUrl, 48, 48)} borderRadius="8px" />
                <Stack gap="0">
                    <Box width="100%" margin="0 auto" overflow="hidden" whiteSpace="nowrap">
                        <Box
                            ref={scrollItemRef}
                            display="inline-block"
                            transform={`translateX(-${overflow}px)`}
                            transition="transform 5s"
                        >
                            <HStack gap="5px">
                                <Text
                                    fontSize="18px"
                                    fontWeight="bold"
                                    display="inline-block"
                                >
                                    {title} •
                                </Text>
                                <Text
                                    fontSize="15px"
                                    fontWeight="medium"
                                >
                                    {artists.join(", ")}
                                </Text>
                            </HStack>
                        </Box>
                    </Box>
                    <Text>
                    {!fact ? `Listened ${playCount == 1 ? "once" : playCount + " times"}` : fact}
                    </Text>
                </Stack>
            </HStack>
        </HStack>
    );
}