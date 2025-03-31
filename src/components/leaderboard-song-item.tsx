import { HStack, Text, Image, Stack, Box } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";

export default function LeaderboardSongItem({
    leaderboardPosition,
    imageUrl,
    title,
    artists,
    playCount,
} : Readonly<{
    leaderboardPosition: number;
    imageUrl: string;
    title: string;
    artists: string[];
    playCount: number;
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
                <Image width="48px" src={imageUrl} borderRadius="8px" />
                <Stack gap="0">
                    <Box width="100%" margin="0 auto" overflow="hidden" whiteSpace="nowrap">
                        <Box
                            ref={scrollItemRef}
                            display="inline-block"
                            transform={`translateX(-${overflow}px)`}
                            transition="transform 5s ease-in-out"
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
                    Listened {playCount == 1 ? "once" : playCount + " times"}
                    </Text>
                </Stack>
            </HStack>
        </HStack>
    );
}