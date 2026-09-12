import { UpdateEvent } from "@/lib/live-ingest";
import { Drawer, DrawerOverlay, DrawerContent, DrawerHeader, DrawerBody, Text, useDisclosure, Image, Box, Tab, TabList, TabPanel, TabPanels, Tabs, Stack, HStack, Center } from "@chakra-ui/react";
import { RefObject, useEffect, useRef, useState } from "react";
import { MdClose, MdExplicit } from "react-icons/md";
import LeaderboardSongItem from "./leaderboard-song-item";
import { formatTimeToMinAndHour } from "./playback-state";
import User from "@/lib/usrlib";
import { getSizedImageUrl } from "@/lib/sized-img";

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

export const SongLeaderboardComponent = ({
    recapData,
    factProcessor,
    background,
}: Readonly<{
    recapData: RecapSortItem[];
    factProcessor: (item?: RecapSortItem) => string;
    background?: string;
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
        background={background ?? "rgba(255, 255, 255, 0.04)"}
        gap="12px"
        pos="relative"
        overflowX="hidden"
    >
        {/* Number 1 song */}
        <HStack color="text.dark" transition=".3s">
            <Image
                src={getSizedImageUrl(recapData.find(v => v.index == 0)?.imageUrl ?? "", 84, 84)}
                width="84px"
                height="84px"
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
                        transition="transform 5s"
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
    user,
    onDismissed,
}: {
    open: () => void;
    close: () => void;
    isOpen: boolean;
    daily: Recap | null;
    weekly: Recap | null;
    user: User;
    /**
     * The recaps the reader has just put away, by id, so the shell stops
     * offering them however the server's "seen" marks went. Closing this drawer
     * is the only way out of it, so the dismissal cannot rest on a request.
     */
    onDismissed: (recapIds: string[]) => void;
}) {
    const [openIndex, setOpenIndex] = useState<number>(0);

    const artwork = useRef<HTMLImageElement>(null);

    useOutsideAlerter(artwork, close);

    /** The recaps whose "seen" mark is away or confirmed, so nothing asks twice. */
    const askedRecapIds = useRef<Set<string>>(new Set());

    /**
     * Tell the server a recap has been seen, at most once.
     *
     * Recorded as asked before the request goes, so the backstop below and the
     * close button cannot both send one, and forgotten again if the mark is
     * refused - a mark that did not land is not done, and whichever path comes
     * next should be free to try it again.
     */
    const markSeen = (type: "daily" | "weekly", recap: Recap) => {
        if (askedRecapIds.current.has(recap.id))
            return;

        askedRecapIds.current.add(recap.id);

        user.markRecapSeen(type)
            .then(marked => {
                if (!marked)
                    askedRecapIds.current.delete(recap.id);
            })
            .catch(ex => {
                askedRecapIds.current.delete(recap.id);

                console.error("Failed to mark the", type, "recap seen, error:", ex);
            });
    };

    /** Whichever recaps are on screen, with the type the server calls them. */
    const shownRecaps = ([
        ["daily", daily],
        ["weekly", weekly],
    ] as const).filter((entry): entry is readonly ["daily" | "weekly", Recap] => !!entry[1]);

    useEffect(() => {
        if (daily && !weekly)
            setOpenIndex(0);
        else if (!daily && weekly)
            setOpenIndex(1);
    }, [daily, weekly]);

    useEffect(() => {
        const reading = openIndex == 0 ? daily : weekly;

        /*
         * Marked after a couple of seconds on screen, so a recap that has been
         * read is put away even if the close button is never reached.
         *
         * The recaps belong in these dependencies. Without them the timer was
         * armed by a change of tab and nothing else, and a lone daily recap -
         * the everyday case - arrives while the index is already 0: the effect
         * had run once on mount with nothing to show, and never ran again. So
         * the backstop covered only the weekly-on-its-own case, which is the
         * one that happens to move the index.
         */
        if (!reading || askedRecapIds.current.has(reading.id))
            return;

        const type = openIndex == 0 ? "daily" : "weekly";

        const timer = setTimeout(() => markSeen(type, reading), 2500);

        return () => clearTimeout(timer);
    }, [openIndex, daily, weekly, user]);

    /*
     * Putting a recap away.
     *
     * Every recap on screen, not merely the tab in front: with a daily and a
     * weekly to read the tabs open on the daily, and closing marked only that
     * one - so the weekly reopened the drawer at the next poll, seconds after
     * it had been closed.
     *
     * The drawer closes on the tap rather than waiting on the marks, which
     * retry in the background. The shell is told first, and remembers, so
     * nothing here has to reach the server for the recap to stay closed.
     */
    const dismiss = () => {
        onDismissed(shownRecaps.map(([, recap]) => recap.id));

        for (const [type, recap] of shownRecaps)
            markSeen(type, recap);

        close();
    };

    return (
        <Drawer placement="bottom" onClose={dismiss} isOpen={isOpen} isFullHeight>
            <DrawerOverlay background="#0D0D0E" />
            {/* Full-height drawers render in a portal, so they are positioned
                against the viewport and the safe-area padding on body never
                reaches them - their content ran under the status bar and the
                notch. Padding rather than margin, so the background still
                reaches the screen edges. */}
            <DrawerContent background="#0D0D0E"
                paddingTop="var(--safe-area-inset-top, 0px)"
                paddingBottom="var(--safe-area-inset-bottom, 0px)"
            >
                <DrawerHeader borderBottomWidth='1px' height="64px">
                    <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
                        <Text>{(daily && weekly) ? "Your Music Recap" : daily ? "Your Daily Recap" : "Your Weekly Recap"}</Text>
                        {/* Named and reachable, since it is the only way out
                            of a drawer that covers the screen: an unlabelled
                            <svg> is nothing at all to a screen reader, and a
                            role on its own is a button that cannot be focused
                            or pressed - so the tab stop and the keys it
                            answers to are spelled out, as they are for the
                            sleeve on Discover. */}
                        <MdClose
                            size="38px"
                            role="button"
                            aria-label="Close recap"
                            tabIndex={0}
                            onClick={dismiss}
                            onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    dismiss();
                                }
                            }}
                            style={{ cursor: "pointer" }}
                        />
                    </Box>
                </DrawerHeader>
                <DrawerBody padding="0" overflowX="hidden">
                    {(daily && weekly) ? (
                        <Tabs isFitted variant='line' defaultIndex={0} onChange={i => {
                            setOpenIndex(i);
                        }}>
                            <TabList mb='1em'>
                                <Tab>Daily Recap</Tab>
                                <Tab>Weekly Recap</Tab>
                            </TabList>
                            <TabPanels marginTop={-5}>
                                <TabPanel>
                                    <RecapContent recap={daily} type="daily" />
                                </TabPanel>
                                <TabPanel>
                                    <RecapContent recap={weekly} type="weekly" />
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