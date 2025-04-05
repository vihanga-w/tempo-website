import { ChangeEvent, use, useEffect, useState } from "react";
import { Avatar, Box, Center, Stack, Text, useColorModeValue } from "@chakra-ui/react";
import { Input } from "./mchat-input";
import { ChakraStylesConfig, Select } from "chakra-react-select";
// import { InteractiveButtonBox as test, VisualViewPortHandler } from "./interactive-btn-box";
import { StyledBtn } from "./button";
import { InteractiveButtonBox } from "./interactive-btn-box";
import { UserLookupResult, UserLookupResultType } from "@/components/user-lookup-result";
import User from "@/lib/usrlib";

export function AddFriendsPage({
    user,
}: {
    user: User;
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
    
    // useEffect(() => {
    //     setSTunIsAttemptingConnect(true);
        
    //     // Create a secure tunnel ready to submit request to add to circle
    //     uplink.startSecureTunnelLegacy()
    //     .then(token => {
    //         setSTunSessionKey(token);
    //         setSTunIsAttemptingConnect(false);
    //     })
    //     .catch(e => {
    //         setSTunIsAttemptingConnect(false);
    //     });
    // }, []);

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

    // const bgColour = useColorModeValue("bg.light", "bg.dark");

    // const [onSearchFieldChange, setOnSearchFieldChange] = useState<((e: ChangeEvent<HTMLInputElement>) => void) | undefined>(undefined);

    // let onSearchFieldChange: (e: ChangeEvent<HTMLInputElement>) => void;

    const handler = async (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.value.trim() == "") {
            // setLookupResults([]);
            const incoming = await user.getFriends(["incoming"]);

            if (incoming.length == 0) {
                setLookupResults([]);
                return;
            }

            const incomingUsers = await Promise.all(incoming.map(async v => {
                const u = await user.searchUsers(v.u1Id == user.object?.id ? v.u2Id : v.u1Id, 1);

                if (u.length == 0)
                    return null;

                return {
                    id: u[0].user.id,
                    pfpUrl: u[0].user.images.length > 0 ? u[0].user.images[0].url : undefined,
                    username: u[0].user.displayName,
                    mutual: u[0].mutualFriends,
                    frState: u[0].friendState,
                };
            }));

            setLookupResults(incomingUsers.filter(v => v != null) as UserLookupResultType[]);

            return;
        }

        console.log("Querying server for user with query:", e.target.value);

        try {
            const results = await user.searchUsers(e.target.value, 25);

            const processed: UserLookupResultType[] = results.map(v => {
                const idealImage = v.user.images.filter(v => v.url.startsWith("https://i.scdn."));
                
                return {
                    id: v.user.id,
                    pfpUrl: idealImage.length > 0 ? idealImage[0].url : v.user.images.length > 0 ? v.user.images[0].url : undefined,
                    username: v.user.displayName,
                    mutual: v.mutualFriends,
                    frState: v.friendState,
                };
            });

            setLookupResults(processed);
        } catch (ex) {
            console.warn("User lookup query failed, error:", ex);
        }
    };

    const onSearchFieldChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (lookupTimeout) clearTimeout(lookupTimeout);

        setLookupTimeout(setTimeout(async () => {
            await handler(e);
        }, lookupResults.length > 0 ? 320 : 0));
    };

    useEffect(() => {
        handler({ target: { value: "" } } as ChangeEvent<HTMLInputElement>);
    }, []);

    return (<>
        <Stack gap="34px">
            <Text
                marginTop="24px"
                fontFamily="Inter"
                fontWeight="regular"
                fontSize="16px"
                opacity="0.75"
            >
                Everything's better with friends—Tempo too! Add friends to share Spotify activity and explore each other's music tastes.
            </Text>
            <Box>
                <Stack gap="20px">
                    <Input
                        // label="Search for someone"
                        placeholder="Search for someone"
                        valid={1}
                        onChange={onSearchFieldChange}
                    />
                    <Box height="calc(100vh - 275px)" overflowY="auto" position="relative">
                        {lookupResults.filter(v => v.id !== user.object?.id).map((v, i) => {
                            return (
                                <UserLookupResult
                                    userId={v.id}
                                    username={v.username}
                                    pfpUrl={v.pfpUrl}
                                    firstItem={i == 0}
                                    mutualFriends={v.mutual}
                                    friendState={v.frState}
                                    // onClick={onCommit}
                                    user={user}
                                    key={v.id + v.username + i}
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