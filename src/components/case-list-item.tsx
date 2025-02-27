import User from "@/lib/usrlib";
import { Box, Stack, Text } from "@chakra-ui/react";

export function CaseListItem({
    user,
    patientName,
    description,
    convoId,
    priority,
    lastState,
    onClick,
}: Readonly<{
    user: User;
    patientName: string,
    description: string;
    // convoId and caseId can be used interchangeable since they mean the same thing
    convoId: string;
    priority: "low" | "med" | "high";
    lastState: {
        text: string;
        lastUpdated: number;
        creatorNameText: string;
    };
    onClick: (convoId: string, patientName: string, priority: string) => void;
}>) {
    const priorityColours = {
        "low": "#1E90FF",
        "med": "#FF4500",
        "high": "#E2062C",
    };

    const priorityColoursRGB = {
        "low": "30, 144, 255",
        "med": "255, 69, 0",
        "high": "226, 6, 44"
    }

    const priorityColour = priorityColours[priority];
    const priorityColourRGB = priorityColoursRGB[priority];

    // Figure out what to show for last activity string
    const msInWeek = 6048e5;
    
    const msgDay = new Date(lastState.lastUpdated).toLocaleDateString([], {
        weekday: "long",
    });
    
    const currDayNum = new Date().getDay();
    const currMonthNum = new Date().getMonth();
    const currYearNum = new Date().getFullYear();
    const msgDayNum = new Date(lastState.lastUpdated).getDay();
    const msgMonthNum = new Date(lastState.lastUpdated).getMonth();
    const msgYearNum = new Date(lastState.lastUpdated).getFullYear();

    const isToday = (currDayNum == msgDayNum && currMonthNum == msgMonthNum && currYearNum == msgYearNum);

    // * 0.8 so we show actual date a bit before a full week has passed
    const isAWeekAgo = lastState.lastUpdated < ((new Date().getTime() - msInWeek) * 0.8);

    const didICreate = (lastState.creatorNameText == "");
    const creatorText = (didICreate ? "You opened this case" : `${lastState.creatorNameText} opened this case`);

    return (<>
        <Box height="68px" width="100%" position="relative">
            {/* Click handler */}
            <Box
                // background="red"
                width="100%"
                height="100%"
                position="absolute"
                zIndex="3"
                onClick={() => {
                    onClick(convoId, patientName, priority);
                }}
            />

            {/* Priority colour bar on left */}
            <Box background={priorityColour} width="4px" height="100%" />

            <Box
                width="calc(100% - 4px)"
                height="100%"
                position="absolute"
                left="4px"
                top="0"
                zIndex={2}
                paddingLeft="8px"
            >
                <Stack gap="0">
                    <Text fontFamily="Inter" fontWeight="semibold" fontSize="18px" marginTop="4px">{patientName}</Text>
                    <Text fontFamily="Inter" fontWeight="regular" fontSize="12px" marginTop="-5px">{description}</Text>
                </Stack>
                <Text
                    fontFamily="Inter"
                    fontWeight="regular"
                    fontSize="12px"
                    color="rgba(255, 255, 255, 0.6)"
                    position="absolute"
                    bottom="5px"
                    left="8px"
                >
                    {lastState.text.trim() == "" ? creatorText : ""}
                </Text>
                <Text
                    position="absolute"
                    top="7px"
                    right="12px"
                    color="rgba(255, 255, 255, 0.6)"
                    fontFamily="Inter"
                    fontWeight="regular"
                    fontSize="12px"
                >
                    {/* Only show the last updated string if we have a value for last updated */}
                    {lastState.lastUpdated !== -1 && lastState.text.trim() !== "" ? (
                        // If last activity was today, show time
                        isToday ? `${new Date(lastState.lastUpdated).getHours()}:${new Date(lastState.lastUpdated).getMinutes()}` :
                        // If last activity was ~a week ago. show date
                        isAWeekAgo ? new Date(lastState.lastUpdated).toLocaleDateString() :
                        // Else if last acivity < ~a week ago, show day
                        msgDay
                    ) : ("")}
                </Text>
            </Box>

            {/* Priority colour gradient */}
            <Box
                width="95px"
                height="100%"
                position="absolute"
                top="0"
                left="0"
                zIndex={1}
                opacity={0.75}
                background={`linear-gradient(90deg, rgba(${priorityColourRGB},0.5) 0%, rgba(${priorityColourRGB},0.22) 32%, rgba(${priorityColourRGB},0.15) 46%, rgba(${priorityColourRGB},0.08) 60%, rgba(${priorityColourRGB},0) 100%);`}
            />
            {/* Priority colour background */}
            <Box
                background={priorityColour}
                width="100%"
                height="100%"
                top="0"
                left="0"
                position="absolute"
                border={"1px solid " + priorityColour}
                opacity="0.2"
                zIndex={1}
            />
        </Box>
    </>);
}