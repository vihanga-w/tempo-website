import { Uplink } from "@/lib/uplink";
import { ChangeEvent, useEffect, useState } from "react";
import { Avatar, Box, Center, Stack, Text, useColorModeValue } from "@chakra-ui/react";
import { Input } from "./mchat-input";
import { ChakraStylesConfig, Select } from "chakra-react-select";
// import { InteractiveButtonBox as test, VisualViewPortHandler } from "./interactive-btn-box";
import { StyledBtn } from "./button";
import { MessageAuthority } from "@/lib/encryption";
import { InteractiveButtonBox } from "./interactive-btn-box";
import { UserLookupResult, UserLookupResultType } from "@/components/user-lookup-result";

export function AddToCirclePage({
    uplink,
    messageAuthority,
    onComplete,
}: {
    uplink: Uplink;
    messageAuthority: MessageAuthority;
    onComplete: (userId: string) => void;
}) {
    // State to switch components to their ready state once init is complete
    // const [patientName, setPatientName] = useState<string>("");
    // const [patientNameDefault, setPatientNameDefault] = useState<boolean>(true);
    // const [shortDesc, setShortDesc] = useState<string>("");
    // const [priority, setPriority] = useState<string | undefined>();
    // const [prioritySetError, setPrioritySetError] = useState<boolean>(false);
    const [STunSessionKey, setSTunSessionKey] = useState<string>("");
    const [STunIsAttemptingConnect, setSTunIsAttemptingConnect] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [lookupTimeout, setLookupTimeout] = useState<NodeJS.Timeout | undefined>();
    const [lookupResults, setLookupResults] = useState<UserLookupResultType[]>([]);

    // const [viewPortHandler, setViewPortHandler] = useState<VisualViewPortHandler>();
    
    useEffect(() => {
        setSTunIsAttemptingConnect(true);
        
        // Create a secure tunnel ready to submit request to add to circle
        uplink.startSecureTunnelLegacy()
        .then(token => {
            setSTunSessionKey(token);
            setSTunIsAttemptingConnect(false);
        })
        .catch(e => {
            setSTunIsAttemptingConnect(false);
        });
    }, []);

    const onCommit = async (userId: string) => {
        setIsSubmitting(true);
        
        // TODO: Figure this out
        // On a slow connection, the tunnel may still be attempting to be created
        // await (() => {
        //     return new Promise<void>((resolve) => {
        //         setSTunIsAttemptingConnect()
        //     });
        // })();

        // Check if we have a valid tunnel token
        const tokenValid = await uplink.verifyTunnelToken(STunSessionKey);

        if (!tokenValid)
            return alert("Sorry, there was an expanding your circle. Please try again later!");

        console.log("Pushing user add to circle request for", userId);

        uplink.pushFrameSync({
            type: "circle-add",
            payload: JSON.stringify({
                targetUser: userId,
                signature: messageAuthority.sign(userId),
            }),
        }, (data, cb) => {
            cb();

            if (data.type == "error" || data.payload !== "successful")
                return alert("Sorry something went wrong: " + data.payload);

            onComplete(userId);
        });
    };

    const textColour = useColorModeValue("text.light", "text.dark");
    const colorVariantName = useColorModeValue("light", "dark");

    // const dropdownChakraStyles: ChakraStylesConfig = {
    //     control: (provided, state) => ({
    //         ...provided,
    //         borderRadius: `0`,
    //         border: "1px",
    //         borderLeft: "none",
    //         borderRight: "none",
    //         borderTop: "none",
    //         borderBottomColor: (priority == "" && priority !== undefined) ? "indianred" : `var(--chakra-colors-accent-${colorVariantName})`,
    //         background: "rgba(255, 255, 255, 0.04)",
    //         _hover: {},
    //     }),
    //     menuList: (provided, state) => ({
    //         ...provided,
    //         border: `1px`,
    //         borderRadius: "0",
    //         borderColor: `var(--chakra-colors-accent-${colorVariantName})`,
    //         background: `rgba(0, 0, 0, 0.1)`,
    //         backdropFilter: "blur(50px)",
    //         _hover: {},
    //     }),
    //     option: (provided, state) => ({
    //         ...provided,
    //         background: `rgba(0, 0, 0, 0.2)`,
    //         _hover: {},
    //     }),
    //     dropdownIndicator: (provided, state) => ({
    //         ...provided,
    //         background: `rgba(255, 255, 255, 0.04)`,
    //         _hover: {},
    //     })
    // };

    const bgColour = useColorModeValue("bg.light", "bg.dark");

    const onSearchFieldChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (lookupTimeout) clearTimeout(lookupTimeout);

        setLookupTimeout(setTimeout(() => {
            if (e.target.value.trim() == "") {
                setLookupResults([]);
                
                return;
            }

            uplink.pushFrameSync({
                type: "lookup-user",
                payload: e.target.value,
            }, (data, cb) => {
                if (data.type == "error") return;

                const results = JSON.parse(data.payload as string) as UserLookupResultType[];

                for (const res of results) {
                    console.log(res);
                }

                setLookupResults(results);
    
                cb();
            });
        }, 320));
    }

    return (<>
        <Stack gap="34px">
            <Text
                marginTop="24px"
                fontFamily="Inter"
                fontWeight="regular"
                fontSize="18px"
                opacity="0.75"
            >
                Collaborate on cases and join teams with people in your circle.
            </Text>
            <Box>
                <Stack gap="20px">
                    <Input
                        label="Search for someone"
                        placeholder="John Doe, john@example.com, 07911123456"
                        valid={1}
                        onChange={onSearchFieldChange}
                    />
                    <Box>
                        {lookupResults.map((v, i) => {
                            return (
                                <UserLookupResult
                                    userId={v.id}
                                    firstName={v.firstName}
                                    lastName={v.lastName}
                                    profession={v.profession}
                                    gravatarHash={v.gravatarHash}
                                    firstItem={i == 0}
                                    onClick={onCommit}
                                />
                            );
                        })}
                    </Box>
                </Stack>
            </Box>
        </Stack>
        {/* <InteractiveButtonBox
            visualViewportBottomOffset={0}
            bgColour={bgColour}
        >
            <Center>
                <StyledBtn
                    isLoading={isSubmitting}
                    disabled={
                        !["low", "med", "high"].includes(priority ?? "") ||
                        patientName == ""
                    }
                    onClick={onCommit}
                >Continue</StyledBtn>
            </Center>
        </InteractiveButtonBox> */}
    </>);
}