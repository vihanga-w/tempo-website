import { SecureUplink, Uplink } from "@/lib/uplink";
import { useEffect, useState } from "react";
import { Avatar, Box, Center, Stack, Text, useColorModeValue } from "@chakra-ui/react";
import { Input } from "./mchat-input";
import { ChakraStylesConfig, Select } from "chakra-react-select";
// import { InteractiveButtonBox as test, VisualViewPortHandler } from "./interactive-btn-box";
import { StyledBtn } from "./button";
import { MessageAuthority } from "@/lib/encryption";
import { InteractiveButtonBox } from "./interactive-btn-box";
import { UserSelectDropdown } from "./user-select-dropdown";
import { UserLookupResultType } from "./user-lookup-result";
import User from "@/lib/usrlib";
import { sha256 } from "@daotl/cryptico";
import { CreateConversationPayload } from "@/lib/convo";

export function NewCasePage({
    uplink,
    messageAuthority,
    onCaseCreate,
}: {
    uplink: Uplink;
    messageAuthority: MessageAuthority;
    onCaseCreate: ({
        patientName,
        caseId,
        priority,
        shortDesc,
    }: Readonly<{
        patientName: string;
        caseId: string;
        priority: string;
        shortDesc: string;
    }>) => void;
}) {
    // State to switch components to their ready state once init is complete
    const [patientName, setPatientName] = useState<string>("");
    const [patientNameDefault, setPatientNameDefault] = useState<boolean>(true);
    const [shortDesc, setShortDesc] = useState<string>("");
    const [priority, setPriority] = useState<string>("low");
    const [prioritySetError, setPrioritySetError] = useState<boolean>(false);
    const [tunnel, setTunnel] = useState<SecureUplink | undefined>();
    const [visualViewportBottomOffset, setVisualViewportBottomOffset] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [selectedUsers, setSelectedUsers] = useState<UserLookupResultType[]>([]);

    // const [viewPortHandler, setViewPortHandler] = useState<VisualViewPortHandler>();
    
    useEffect(() => {
        uplink.startSecureTunnel()
        .then(tunnel => {
            setTunnel(tunnel);
        });
    }, []);

    const onCommit = async () => {
        if (!tunnel)
            return;

        setIsSubmitting(true);

        const memberList = selectedUsers.map(v => v.id);
        const signatureHash = sha256([
            patientName,
            shortDesc,
            priority,
            memberList.sort().join(""),
        ].join(""));
        const signature = messageAuthority.sign(signatureHash);

        const payload: CreateConversationPayload ={
            type: "case",
            recipientsIds: memberList,
            settings: {
                ephermeral: false,
            },
            metadata: {
                patientName,
                shortDesc,
                priority,
                requestSignature: signature,
            }
        }

        console.log("Pushing create new case payload:", payload);

        const res = await tunnel.pushSecureFrame({
            type: "s-createconvo",
            payload,
        });

        await tunnel.close();

        // TODO: Better error page
        if (res.type == "error") {
            alert("Sorry, something went wrong while trying to create the case! Please try again later!");

            return;
        }

        const convoId = res.payload as string;

        console.log("Created new case with conversation id:", convoId);

        onCaseCreate({
            patientName,
            caseId: convoId,
            priority,
            shortDesc,
        });
    };

    const textColour = useColorModeValue("text.light", "text.dark");
    const colorVariantName = useColorModeValue("light", "dark");

    const dropdownChakraStyles: ChakraStylesConfig = {
        control: (provided, state) => ({
            ...provided,
            borderRadius: `0`,
            border: "1px",
            borderLeft: "none",
            borderRight: "none",
            borderTop: "none",
            borderBottomColor: (priority == "" && priority !== undefined) ? "indianred" : `var(--chakra-colors-accent-${colorVariantName})`,
            background: "rgba(255, 255, 255, 0.04)",
            _hover: {},
        }),
        menuList: (provided, state) => ({
            ...provided,
            border: `1px`,
            borderRadius: "0",
            borderColor: `var(--chakra-colors-accent-${colorVariantName})`,
            background: `rgba(0, 0, 0, 0.1)`,
            backdropFilter: "blur(50px)",
            _hover: {},
        }),
        option: (provided, state) => ({
            ...provided,
            background: `rgba(0, 0, 0, 0.2)`,
            _hover: {},
        }),
        dropdownIndicator: (provided, state) => ({
            ...provided,
            background: `rgba(255, 255, 255, 0.04)`,
            _hover: {},
        })
    };

    const bgColour = useColorModeValue("bg.light", "bg.dark");

    return (<>
        <Stack gap="34px">
            <Text
                marginTop="24px"
                fontFamily="Inter"
                fontWeight="regular"
                fontSize="18px"
                opacity="0.75"
            >
                Create a new case to assign team members and discuss sensitive details securely.
            </Text>
            <Box>
                <Input
                    label="Patient Name"
                    valid={(patientNameDefault || patientName !== "") ? 1 : 0}
                    value={patientName}
                    onChange={e => {
                        setPatientName(e.target.value);
                        setPatientNameDefault(false);
                    }}
                    // onFocus={() => { viewPortHandler?.forceUpdate(); }}
                />
                <Input
                    label="Short Description"
                    valid={1}
                    value={shortDesc}
                    onChange={e => {
                        setShortDesc(e.target.value);
                    }}
                    // onFocus={() => { viewPortHandler?.forceUpdate(); }}
                />
                <Stack gap="2px">
                    <Text textColor={textColour}>Priority</Text>
                    <Select
                        defaultInputValue=""
                        menuPortalTarget={document.body}
                        maxMenuHeight={200}
                        errorBorderColor="indianred"
                        chakraStyles={dropdownChakraStyles}
                        options={[
                            {
                                label: "Low",
                                value: "low"
                            },
                            {
                                label: "Medium",
                                value: "med"
                            },
                            {
                                label: "High",
                                value: "high"
                            },
                        ]}
                        placeholder="Select a priority..."
                        // onFocus={() => { viewPortHandler?.forceUpdate(); }}
                        onChange={e => {
                            const value = (e as {value: string}).value;

                            if (["low", "med", "high"].includes(value))
                                setPriority(value);
                            else
                                setPriority("");
                        }}
                    />
                </Stack>
                <Stack gap="2px">
                    <Text textColor={textColour}>Members</Text>
                    <UserSelectDropdown
                        uplink={uplink}
                        onSelectUser={(users) => {
                            setSelectedUsers(users);
                        }}
                    />
                </Stack>
            </Box>
        </Stack>
        <InteractiveButtonBox
            visualViewportBottomOffset={0}
            bgColour={bgColour}
        >
            <Center>
                <StyledBtn
                    isLoading={isSubmitting || !tunnel}
                    disabled={
                        !["low", "med", "high"].includes(priority ?? "") ||
                        patientName == "" ||
                        selectedUsers.length == 0 ||
                        !tunnel
                    }
                    onClick={onCommit}
                >Continue</StyledBtn>
            </Center>
        </InteractiveButtonBox>
    </>);
}