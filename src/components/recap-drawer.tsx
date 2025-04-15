import { UpdateEvent } from "@/lib/live-ingest";
import { Drawer, DrawerOverlay, DrawerContent, DrawerHeader, DrawerBody, Text, useDisclosure, Image, Box, Tab, TabList, TabPanel, TabPanels, Tabs, Stack, HStack, Center } from "@chakra-ui/react";
import { RefObject, useEffect, useRef } from "react";
import { MdClose } from "react-icons/md";

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
        <Stack fontFamily="Inter" gap={0} width="80px" transform="scale(0.8)">
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

    console.log(day, dateNum, month);

    return (<>
        {/* {JSON.stringify(recap)} */}
        <HStack width="100%" justifyContent="space-between">
            <DateComponent
                dayNum={dateNum}
                dayStr={day}
                monthStr={month}
            />
            <Box width="32%" height="1px" background="white" />
            <DateComponent
                dayNum={recapProcessedDate.getDate()}
                dayStr={dayMap[recapProcessedDate.getDay()]}
                monthStr={monthMap[recapProcessedDate.getMonth()]}
            />
        </HStack>
    </>);
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