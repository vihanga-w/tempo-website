import { UpdateEvent } from "@/lib/live-ingest";
import { Drawer, DrawerOverlay, DrawerContent, DrawerHeader, DrawerBody, Text, useDisclosure, Image, Box, Tab, TabList, TabPanel, TabPanels, Tabs, Stack, HStack, Center } from "@chakra-ui/react";
import { RefObject, useEffect, useRef, useState } from "react";
import { MdClose, MdExplicit } from "react-icons/md";
import LeaderboardSongItem from "./leaderboard-song-item";
import { formatTimeToMinAndHour } from "./playback-state";

interface RecapSortItem {
    id: string;
    title: string;
    artists: string[];
    index: number;
    explicit: boolean;
    playCount: number;
    listenDuration: number;
    imageUrl: string;
};

export interface Recap {
    id: string;
    playCountSort: RecapSortItem[];
    listenDurationSort: RecapSortItem[];
    timestamp: number;
};

function useOutsideAlerter(ref: RefObject<any>, cb: () => void) {
    useEffect(() => {
        function handleClickOutside(event: any) {
            if (ref.current && !ref.current.contains(event.target))
                cb();
        }

        // Bind the event listener
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            // Unbind the event listener on clean up
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [ref]);
}

const SongLeaderboardComponent = ({
    recapData,
    factProcessor,
}: Readonly<{
    recapData: RecapSortItem[];
    factProcessor: (item?: RecapSortItem) => string;
}>) => {
    const scrollItemRef = useRef<HTMLDivElement>(null);
    const [topSongOverflow, setTopSongOverflow] = useState<number>(-1);
    
    useEffect(() => {
        if (!scrollItemRef.current)
            return;

        if (scrollItemRef.current.getBoundingClientRect().width <= window.innerWidth - 155)
            return;

        const process = () => {
            if (scrollItemRef.current && topSongOverflow <= 0)
                setTopSongOverflow(scrollItemRef.current.getBoundingClientRect().width - (window.innerWidth - 162));
            else
                setTopSongOverflow(0);
        }

        if (topSongOverflow == -1)
            setTimeout(() => { process() }, 2500);

        setTimeout(() => { process() }, 10e3);
    }, [scrollItemRef, topSongOverflow]);

    return (<Stack
        width="100%"
        minHeight="356px"
        padding="12px"
        borderRadius="12px"
        background="rgba(255, 255, 255, 0.04)"
        gap="12px"
        pos="relative"
        overflowX="hidden"
    >
        {/* Number 1 song */}
        <HStack color="text.dark" transition=".3s">
            <Image
                src={recapData.find(v => v.index == 0)?.imageUrl}
                width="84px"
                borderRadius="8px"
            />
            <Box pos="relative" width="100%">
                <Text
                    fontWeight="black"
                    fontSize="20px"
                >Most Played</Text>
                <Text
                    fontWeight="medium"
                    fontSize="18px"
                >{factProcessor(recapData.find(v => v.index == 0))}</Text>
                <HStack whiteSpace="nowrap" paddingRight="5px" margin="0 auto" overflow="hidden" gap="5px">
                    <Box
                        // display="inline-block"
                        transform={`translateX(-${topSongOverflow}px)`}
                        transition="transform 5s ease-in-out"
                        ref={scrollItemRef}
                    >
                        <HStack>
                            <Text
                                fontWeight="medium"
                                fontSize="18px"
                            >{recapData.find(v => v.index == 0)?.title}</Text>
                            <MdExplicit />
                            <Text>• {recapData.find(v => v.index == 0)?.artists.join(", ")}</Text>
                        </HStack>
                    </Box>
                </HStack>
            </Box>
        </HStack>
        <Stack gap="10px" paddingBottom="2px" transition=".3s">
            {recapData.slice(1, 5).map((v) => {
                return (
                    <LeaderboardSongItem
                        key={v.index + v.title + v.artists.join("") + v.playCount}
                        leaderboardPosition={v.index + 1}
                        imageUrl={v.imageUrl}
                        title={v.title}
                        artists={v.artists}
                        playCount={v.playCount}
                        fact={factProcessor(v)}
                    />
                );
            })}
        </Stack>
    </Stack>);
}

const DateComponent = ({
    dayNum,
    dayStr,
    monthStr,
}: Readonly<{
    dayNum: number;
    dayStr: string;
    monthStr: string;
}>) => {
    return (<>
        <Stack fontFamily="Inter" gap={0} width="80px" transform="scale(0.75)">
            <Text fontWeight="bold" fontSize="33px" textAlign="center">{dayStr}</Text>
            <Center>
                <HStack>
                    <Text fontSize="23px" fontWeight="medium" textAlign="center">{dayNum}</Text>
                    <Text fontSize="23px" fontWeight="medium" textAlign="center">{monthStr}</Text>
                </HStack>
            </Center>
        </Stack>
    </>);
}

const RecapContent = ({
    recap,
    type,
}: {
    recap: Recap;
    type: "daily" | "weekly";
}) => {
    const recapProcessedDate = new Date(recap.timestamp);

    let recapStartDate = (recapProcessedDate.getTime() - (recapProcessedDate.getMinutes() * 60e3) - (recapProcessedDate.getHours() * 3600e3) - (recapProcessedDate.getSeconds() * 1e3) - (recapProcessedDate.getMilliseconds()));

    if (type == "daily")
        recapStartDate -= (24 * 3600e3);
    else if (type == "weekly")
        recapStartDate -= (24 * 3600e3 * 7);

    const dayMap = [
        "Sun",
        "Mon",
        "Tue",
        "Wed",
        "Thu",
        "Fri",
        "Sat",
    ];

    const monthMap = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];

    const dateNum = new Date(recapStartDate).getDate();
    const day = dayMap[new Date(recapStartDate).getDay()];
    const month = monthMap[new Date(recapStartDate).getMonth()];

    return (<Stack gap="15px" paddingLeft="10px" paddingRight="10px" paddingBottom="15px">
        <HStack width="100%" justifyContent="space-between" paddingLeft="10px" paddingRight="10px">
            {type == "weekly" ? (<Center width="100%" height="62px" justifyContent="space-between">
                <DateComponent
                    dayNum={dateNum}
                    dayStr={day}
                    monthStr={month}
                />
                <Box width="100%" height="1px" background="white" marginLeft="18px" marginRight="18px" />
                <DateComponent
                    dayNum={recapProcessedDate.getDate()}
                    dayStr={dayMap[recapProcessedDate.getDay()]}
                    monthStr={monthMap[recapProcessedDate.getMonth()]}
                />
            </Center>) : (<Center width="100%" height="62px" justifyContent="space-between">
                <Box width="100%" height="1px" background="white" marginRight="12px" />
                <Text fontFamily="Inter" fontSize="38px" fontWeight="black" textAlign="center">YESTERDAY</Text>
                <Box width="100%" height="1px" background="white" marginLeft="12px" />
            </Center>)}
        </HStack>

        <Box width="100vw" height="1px" background="rgba(255, 255, 255, 0.16)" marginLeft="-20px" />
        
        {/* Sort by play count */}
        <Stack gap={0}>
            <Text fontFamily="Inter" fontSize="28px" fontWeight="black" marginLeft="2px">On Repeat</Text>
            <SongLeaderboardComponent
                recapData={recap.playCountSort}
                factProcessor={(item) => {
                    if (!item)
                        return "";

                    return `Listened ${item.playCount == 1 ? "once" : item.playCount + " times"}`;
                }}
            />
        </Stack>

        {/* Sort by listen duration */}
        <Stack gap={0}>
            <Text fontFamily="Inter" fontSize="28px" fontWeight="black" marginLeft="2px">Time Spent Listening</Text>
            <SongLeaderboardComponent
                recapData={recap.listenDurationSort}
                factProcessor={(item) => {
                    if (!item)
                        return "";

                    return `Listened for ${formatTimeToMinAndHour(item.listenDuration)}`;
                }}
            />
        </Stack>
    </Stack>);
}

export default function ReactionDrawer({
    open,
    close,
    isOpen,
    daily,
    weekly,
}: {
    open: () => void;
    close: () => void;
    isOpen: boolean;
    daily: Recap | null;
    weekly: Recap | null;
}) {
    const artwork = useRef<HTMLImageElement>(null);

    useOutsideAlerter(artwork, close);

    return (
        <Drawer placement="bottom" onClose={close} isOpen={isOpen} isFullHeight>
            <DrawerOverlay background="#0D0D0E" />
            <DrawerContent background="#0D0D0E">
                <DrawerHeader borderBottomWidth='1px' height="64px">
                    <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
                        <Text>{(daily && weekly) ? "Your Music Recap" : daily ? "Your Daily Recap" : "Your Weekly Recap"}</Text>
                        <MdClose size="38px" onClick={() => {
                            close();
                        }} />
                    </Box>
                </DrawerHeader>
                <DrawerBody padding="0">
                    {(daily && weekly) ? (
                        <Tabs isFitted variant='line' defaultIndex={0}>
                            <TabList mb='1em'>
                                <Tab>Daily Recap</Tab>
                                <Tab>Weekly Recap</Tab>
                            </TabList>
                            <TabPanels marginTop={-5}>
                                <TabPanel>
                                    <RecapContent recap={daily} type="daily" />
                                </TabPanel>
                                <TabPanel>
                                    <RecapContent recap={daily} type="weekly" />
                                </TabPanel>
                            </TabPanels>
                        </Tabs>
                    ) : daily ? (<Box padding="10px">
                        <RecapContent recap={daily} type={"daily"} />
                    </Box>) : weekly ? (<Box padding="10px">
                        <RecapContent recap={weekly} type={"weekly"} />
                    </Box>) : (<></>)}
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}