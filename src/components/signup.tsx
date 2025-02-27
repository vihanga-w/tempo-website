'use client';

import { Uplink } from "@/lib/uplink";
import {
    Text,
    Image,
    Stack,
    useColorModeValue,
    Box,
    Center,
    useBoolean,
    PinInput,
    PinInputField,
    HStack,
    Input as ChakraInput,
    InputGroup,
    InputLeftAddon,
    InputRightElement,
    Button,
    Spinner,
    Popover,
    PopoverTrigger,
    PopoverContent,
    PopoverCloseButton,
    PopoverHeader,
    PopoverBody,
    PopoverFooter,
    ButtonGroup,
    PopoverArrow,
    Link,
} from "@chakra-ui/react";

import {
    Step,
    StepDescription,
    StepIcon,
    StepIndicator,
    StepSeparator,
    StepStatus,
    StepTitle,
    Stepper,
    useSteps,
    useDisclosure,
} from '@chakra-ui/react';

import { TimeIcon } from '@chakra-ui/icons';

import { ChakraStylesConfig, CreatableSelect } from "chakra-react-select";
import parsePhoneNumber, { AsYouType } from 'libphonenumber-js';
import { createHash } from "crypto";
import { StyledBtn } from "@/components/button";
import { Input } from "@/components/mchat-input";

// Fonts
import '@fontsource/inter';
import React, { useEffect, useState } from "react";
import NodeRSA from "node-rsa";
import { TokenStorage } from "@/lib/tokens";
import PageRouter from "@/lib/page-router";
import { VisualViewPortHandler } from "./interactive-btn-box";

type isEmailAvailableQuery = {
    checkId: string;
    source: "register";
    email: string;
}

type CreateAuthPayload = {
    phoneNumber: string;
    passwordHash: string;
}

const InteractiveButtonBox = ({
    children,
    visualViewportBottomOffset,
    bgColour
}: Readonly<{
    children: React.ReactNode,
    visualViewportBottomOffset: number,
    bgColour: string,
}>) => {
    return (
        <Box
            position="absolute"
            width="100vw"
            left="0"
            bottom={visualViewportBottomOffset + "px"}
            paddingTop={visualViewportBottomOffset > 0 ? "12.5px" : "0px"}
            paddingBottom={visualViewportBottomOffset > 0 ? "12.5px" : "35px"}
            transition=".2s"
            background={bgColour}
        >{children}</Box>
    );
}

const PasswordRequirement = ({
    children,
    isMet,
}: Readonly<{
    children?: React.ReactNode,
    isMet?: boolean,
}>) => {
    const accentColour = useColorModeValue("accent.light", "accent.dark");
    const themeVariant = useColorModeValue("light", "dark");

    return (
        <HStack gap="8px" marginLeft="8px">
            <Box borderRadius="50%" width="14px" height="14px" border={`1px solid var(--chakra-colors-accent-${themeVariant})`} background={isMet ? accentColour : "rgba(255, 255, 255, 0.1)"}>
                {isMet ? (<Center width="100%" height="100%">
                    <Image width="7px" src="/icons/ui/checkmark.svg" />
                </Center>) : (<></>)}
            </Box>
            <Text fontSize="12px" height="14px">{children}</Text>
        </HStack>
    );
}

const DetailsConfirmation = ({
    name,
    value,
}: {
    name: string,
    value: string,
}) => {
    const textColour = useColorModeValue("text.light", "text.dark");

    return (<>
        <Stack gap="0px">
            <Text textColor={textColour} fontSize="14px">{name}</Text>
            <Text textColor={textColour} fontSize="18px" fontWeight="bold">{value}</Text>
        </Stack>
    </>);
}

export function Signup({
    uplink,
    prouter,
    flowCompleteCb,
}: Readonly<{
    uplink: Uplink,
    prouter: PageRouter,
    flowCompleteCb: () => void,
}>) {
    // States
    const [isUplinkActive, setIsUplinkActive] = useBoolean();
    const [isLoginStarted, setIsLoginStarted] = useBoolean();
    const [isRegistrationStarted, setIsRegistrationStarted] = useBoolean();
    const [isApplyingInvite, setIsApplyingInvite] = useBoolean();
    const [isApplyingDetails, setIsApplyingDetails] = useBoolean();
    const [isApplyingPassword, setIsApplyingPassword] = useBoolean();
    const [isRegisteringAccount, setIsRegisteringAccount] = useBoolean();
    
    // Input validation states
    const [isFNValid, setIsFNValid] = useBoolean(true);
    const [isLNValid, setIsLNValid] = useBoolean(true);
    const [isEMValid, setIsEMValid] = useBoolean(true);
    const [isPNValid, setIsPNValid] = useBoolean(true);
    
    const [showPassword, setShowPassword] = useBoolean();
    const [visualViewportBottomOffset, setVisualViewportBottomOffset] = useState<number>(0);
    const [professionsList, setProfessionsList] = useState<{label: string, value: string}[]>([]);
    const [registrationPhase, setRegistrationPhase] = useState<number>(0); // TODO: Change back to default value of 0
    const [registrationKey, setRegistrationKey] = useState<string>();
    const [inviteCode, setInviteCode] = useState<string>("3YF0R8"); // TODO: Reset this
    const [inviteCodeValidity, setInviteCodeValidity] = useState<string>("unknown");
    const [firstName, setFirstName] = useState<string>("");
    const [lastName, setLastName] = useState<string>("");
    const [email, setEmail] = useState<string>("");
    const [profession, setProfession] = useState<string>("");
    const [phoneNumber, setPhoneNumber] = useState<string>("");
    const [passwordHash, setPasswordHash] = useState<string>("");
    const [confirmPasswordHash, setConfirmPasswordHash] = useState<string>("");
    const [STunSessionKey, setSTunSessionKey] = useState<string>("");

    const [accountCreateResponseFrameId, setAccountCreateResponseFrameId] = useState<string>("");
    const [viewPortHandler, setViewPortHandler] = useState<VisualViewPortHandler>();

    // Password requirement states
    const [passCharLim, setPassCharLim] = useBoolean();
    const [passSpecial, setPassSpecial] = useBoolean();
    const [passConsec, setPassConsec] = useBoolean();
    const [passName, setPassName] = useBoolean();

    // Dynamic page styling
    const bgColour = useColorModeValue("bg.light", "bg.dark");
    const textColour = useColorModeValue("text.light", "text.dark");
    const colorVariantName = useColorModeValue("light", "dark");
    const colourPrimary = useColorModeValue("primary.light", "primary.dark");

    // States for targetted error popovers
    const { isOpen: isLoginErrorOpen, onClose: onLoginErrorClose, onOpen: onLoginErrorOpen } = useDisclosure();
    const [loginErrMsg, setLoginErrMsg] = useState<string>("Sorry, we were unable to authenticate you!");

    useEffect(() => {
        setViewPortHandler(new VisualViewPortHandler(offest => {
            setVisualViewportBottomOffset(offest);
        }));

        if (uplink.isReady) setIsUplinkActive.on();
        else setIsUplinkActive.off();

        uplink.on("ready", () => {
            setIsUplinkActive.on();
        });

        uplink.on("close", () => {
            setIsUplinkActive.off();
        });

        // Load a list of available pre-configured professions from the server
        fetch("/api/professions")
        .then(r => r.json())
        .then(p => {
            const data = p as {label: string, value: string}[];

            setProfessionsList(data);
        })
        .catch(e => {
            console.error("Failed to fetch professions list:", e);

            // TODO: Retry when the server connection is restored
        });
    }, []);

    function startRegistration() {
        setIsRegistrationStarted.on();

        // Tell the server that we are registering a new account
        uplink.pushFrameSync({
            type: "register",
            payload: "",
        }, (frame, cb) => {
            if (frame.type == "error") {
                alert("Unable to start account registration: " + frame.payload);
                setIsRegistrationStarted.off();
                
                return cb();
            }

            const registrationKey = frame.payload + ":" + frame.frameId;

            if (registrationKey == "") return alert("Unable to start account registration: the server supplied an invalid registration key");

            setRegistrationKey(registrationKey);
            setRegistrationPhase(1);

            cb();
        });
    }

    function completeInvCodeEntry() {
        setInviteCodeValidity("unknown");
        setIsApplyingInvite.on();

        // Artificially make this take a tiny bit longer
        // This makes an invalid code seem like less of an error (on our side to the user)
        setTimeout(() => {
            uplink.pushFrameSync({
                type: "register",
                payload: inviteCode
            }, (frame, cb) => {
                if (frame.type == "error") {
                    alert(frame.payload);
                    setIsApplyingInvite.off();

                    return cb();
                }

                if (frame.payload !== "success") {
                    setInviteCodeValidity("invalid");
                    setIsApplyingInvite.off();

                    return cb();
                }

                setAccountCreateResponseFrameId(frame.frameId ?? "");
                setRegistrationPhase(2);
                cb();
            }, registrationKey?.split(":")[1]);
        }, 500);
    }

    const dropdownChakraStyles: ChakraStylesConfig = {
        control: (provided, state) => ({
            ...provided,
            borderRadius: `0`,
            border: "1px",
            borderLeft: "none",
            borderRight: "none",
            borderTop: "none",
            borderBottomColor: `var(--chakra-colors-accent-${colorVariantName})`,
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

    // Algorithm to identify consecutive number sequence
    const identifyCriticalConsecutiveNumbers = (input: string) => {
        const numbers = ["0","1","2","3","4","5","6","7","8","9"];

        let prevChar = "";
        let sequenceLen = 0;

        for (const char of input) {
            if (numbers.includes(char) && (numbers.includes(prevChar) && (parseInt(prevChar) + 1 == parseInt(char) || parseInt(prevChar) - 1 == parseInt(char)))) {
                // This character is a number
                // Found consecutive number string
                sequenceLen++;
            } else {
                sequenceLen = 0;
            }

            prevChar = char;

            if ((sequenceLen + 1) > 2) return true;
        }

        return false;
    }

    function SHA512(data: string) {  
        return createHash('sha512').update(data).digest('hex');
    }

    useEffect(() => {
        window.localStorage
        // Wait until the user stops typing for at least 500ms before checking email
        // This prevents spamming the socket while user is finishing typing their email
        const delayCheckFn = setTimeout(() => {
            if (email == "") return;

            // TODO: This is a complex statement, maybe reduce the complexity?
            if (email == "" || !email.includes("@") || !(email.includes("@") && email.split("@")[1].includes(".") && email.split("@")[1].split(".")[email.split("@")[1].split(".").length - 1] !== "")) {
                setIsEMValid.off();
            } else {
                // Email is off a valid format
                const emailCheckPayload: isEmailAvailableQuery = {
                    source: "register",
                    checkId: registrationKey?.split(":")[0] ?? "",
                    email: email,
                }

                uplink.pushFrameSync({
                    type: "isEmailAvailable",
                    payload: JSON.stringify(emailCheckPayload),
                }, (data, cb) => {
                    if (data.payload === "true") {
                        // The email is available!
                        setIsEMValid.on();
                    } else {
                        // TODO: Need to tell the user that the email is already used
                        // TODO: Perhaps using a forced popover or modal
                        console.log("Email availability check returned a non-true value:", data.payload);
                        setIsEMValid.off();
                    }

                    cb();
                });
            }
        }, 500);
    
        return () => clearTimeout(delayCheckFn);
    }, [email]);

    const hash = (d: string, rounds: number = 1) => {
        let hash = "";

        for (let i = 0; i < rounds; i++) {
            hash = createHash("sha512").update(hash == "" ? d : hash).digest("hex");
        }

        return hash;
    }

    const getPasswordHash = (password: string) => {
        const parsedPhoneNumber = parsePhoneNumber(phoneNumber, "GB");

        if (!parsedPhoneNumber?.formatInternational()) return hash("UNSEC", 2);

        return hash(parsedPhoneNumber.formatInternational() + password, 3);
    }

    const accountCreationSteps = [
        { title: 'Verifying Details', description: 'Checking data validity' },
        { title: 'Generating Encryption Keys', description: 'For sensitive information' },
        { title: 'Registering Account', description: 'Your account is being created' },
        { title: 'Account Created', description: 'Your account has been created!' },
    ];

    const { activeStep: activeAccCreationStep, setActiveStep: setActiveAccCreationStep } = useSteps({
        index: 1,
        count: accountCreationSteps.length,
    });

    return (<Box overflow="hidden">
        <Stack
            paddingTop="64px"
            paddingLeft="24px"
            paddingRight="24px"
            gap="25px"
        >
            <Image
                src={`/logo-clear-${colorVariantName}.svg`}
                alt="MChat logo"
                width="127px"
                userSelect="none"
            />
            {/* Registration phases starting 0X are for signup pages */}
            {registrationPhase == 0 ? (<>
                <Stack gap="0px">
                    <Text color={textColour} fontFamily="Inter" fontSize="22px">Welcome to MChat!</Text>
                    <Text color={textColour} fontFamily="Inter" width="95%" opacity=".75" fontSize="18px">MChat is a secure messaging application designed for medical professionals.</Text>
                </Stack>
                <Box
                    position="absolute"
                    width="100vw"
                    left="0"
                    bottom="35px"
                >
                    <Center
                        width="calc(100% - 48px)"
                        marginLeft="24px"
                    >
                        <Stack width="100%" gap="15px">
                            <StyledBtn
                                isLoading={!isUplinkActive || isRegistrationStarted}
                                onClick={startRegistration}
                                marginLeft="0px"
                                marginRight="0px"
                            >Let's get started!</StyledBtn>
                            <Box
                                opacity={(!isUplinkActive || isRegistrationStarted) ? "0" : "1"}
                                marginBottom={(!isUplinkActive || isRegistrationStarted) ? "-45px" : "0px"}
                                transition=".3s"
                                height="22px"
                            >{!isLoginStarted ? (<Text width="100%" textAlign="center" fontSize="14px" color={colourPrimary} onClick={async () => {
                                setIsLoginStarted.on();

                                const sessionKey = await uplink.startSecureTunnelLegacy();

                                // We will use these states for both login and registration
                                // So we must check that they have been reset
                                setPhoneNumber("");
                                setPasswordHash("");
                                setSTunSessionKey(sessionKey);
                                setIsApplyingDetails.off();

                                setRegistrationPhase(90);
                            }}>I already have an account!</Text>) : (<Center><Spinner size="sm" opacity=".75" /></Center>)}</Box>
                        </Stack>
                    </Center>
                </Box>
            </>) : (<></>)}
            {registrationPhase == 1 ? (<>
                <Stack gap="20px" paddingTop="36px">
                    <HStack>
                        <PinInput id="pininp" autoFocus manageFocus onChange={v => {
                            setInviteCodeValidity("unknown");
                            setInviteCode(v.toUpperCase());
                        }} placeholder="" type="alphanumeric">
                            <PinInputField _hover={{}} _focus={{}} borderColor={inviteCodeValidity == "invalid" ? "indianred" : "inherit"} />
                            <PinInputField _hover={{}} _focus={{}} borderColor={inviteCodeValidity == "invalid" ? "indianred" : "inherit"} />
                            <PinInputField _hover={{}} _focus={{}} borderColor={inviteCodeValidity == "invalid" ? "indianred" : "inherit"} />
                            <PinInputField _hover={{}} _focus={{}} borderColor={inviteCodeValidity == "invalid" ? "indianred" : "inherit"} />
                            <PinInputField _hover={{}} _focus={{}} borderColor={inviteCodeValidity == "invalid" ? "indianred" : "inherit"} />
                            <PinInputField _hover={{}} _focus={{}} borderColor={inviteCodeValidity == "invalid" ? "indianred" : "inherit"} />
                        </PinInput>
                    </HStack>
                    <Stack gap="0px">
                        <Text color={textColour} fontFamily="Inter" fontSize="22px">Enter your invite code</Text>
                        <Text color={textColour} fontFamily="Inter" width="95%" opacity=".75" fontSize="18px">To create an MChat account, you need an invite code.<br/><br/>If a colleague has MChat, ask them for their invite code, otherwise <a href="#" style={{color: "skyblue"}}>request one from us</a>.</Text>
                    </Stack>
                </Stack>
                <InteractiveButtonBox
                    visualViewportBottomOffset={visualViewportBottomOffset}
                    bgColour={bgColour}
                >
                    <Center>
                        <StyledBtn
                            isLoading={isApplyingInvite}
                            disabled={inviteCode.length !== 6 || !isUplinkActive}
                            onClick={completeInvCodeEntry}
                        >Continue</StyledBtn>
                    </Center>
                </InteractiveButtonBox>
            </>) : (<></>)}
            {registrationPhase == 2 ? (<>
                <Stack gap="0px">
                    <Text color={textColour} fontFamily="Inter" fontSize="22px">We need a couple details</Text>
                    <Text color={textColour} fontFamily="Inter" width="95%" opacity=".75" fontSize="18px">These details are required to create your MChat profile.</Text>
                </Stack>
                <Stack gap="12px">
                    <HStack gap="10px">
                        <Input valid={isFNValid ? 1 : 0} value={firstName} onChange={e => {
                            if (e.target.value == "") setIsFNValid.off();
                            else setIsFNValid.on();
                            setFirstName(e.target.value);
                        }} autoComplete="given-name" onFocus={() => { viewPortHandler?.forceUpdate(); }} width="100%" label="First Name" />
                        <Input valid={isLNValid ? 1 : 0} value={lastName} onChange={e => {
                            if (e.target.value == "") setIsLNValid.off();
                            else setIsLNValid.on();
                            setLastName(e.target.value);
                        }} autoComplete="family-name" onFocus={() => { viewPortHandler?.forceUpdate(); }} width="100%" label="Last Name" />
                    </HStack>
                    <Input valid={isEMValid ? 1 : 0} value={email} onChange={e => {
                        if (e.target.value == "" || !e.target.value.includes("@") || !(e.target.value.includes("@") && e.target.value.split("@")[1].includes(".") && e.target.value.split("@")[1].split(".")[e.target.value.split("@")[1].split(".").length - 1] !== "")) {
                            setIsEMValid.off();
                        }
                        setEmail(e.target.value.split(" ").join(""));
                    }} type="email" autoComplete="email" onFocus={() => { viewPortHandler?.forceUpdate(); }} label="Email Address" />
                    <Stack gap="2px">
                        <Text textColor={textColour}>Profession</Text>
                        <CreatableSelect
                            defaultInputValue={profession}
                            menuPortalTarget={document.body}
                            onFocus={() => { viewPortHandler?.forceUpdate(); }}
                            maxMenuHeight={200}
                            errorBorderColor="indianred"
                            chakraStyles={dropdownChakraStyles}
                            options={professionsList}
                            placeholder="Select a profession..."
                            onChange={e => {
                                setProfession((e as {label: string}).label);
                            }}
                        />
                    </Stack>
                    <Stack gap="2px">
                        <Text color={textColour}>Phone Number</Text>
                        <HStack gap="18px">
                            <InputGroup width="100%">
                                <InputLeftAddon
                                    height="38px"
                                    width="54px"
                                    paddingLeft="10px"
                                    color={textColour}
                                    borderBottom={`1px solid ${isPNValid ? `var(--chakra-colors-accent-${colorVariantName})` : "indianred"}`}
                                    borderRight="none"
                                    borderRadius="0"
                                    background="rgba(255, 255, 255, 0.08)"
                                    transition=".25s"
                                >+44</InputLeftAddon>
                                <Input valid={isPNValid ? 1 : 0} value={parsePhoneNumber(phoneNumber, "GB")?.formatNational()} width="100%" type="tel" autoComplete="tel" addonposition="left" onChange={e => {
                                    const pn = parsePhoneNumber(e.target.value, "GB");

                                    setPhoneNumber((pn?.number ?? "").toString());

                                    if (pn?.isPossible()) setIsPNValid.on();
                                    else setIsPNValid.off();

                                    e.target.value = new AsYouType('GB').input(e.target.value);
                                }} height="38px" maxLength={15} />
                            </InputGroup>
                            <Text textColor={textColour} width="105px" fontSize="9px">We may use this phone number to contact you</Text>
                        </HStack>
                    </Stack>
                </Stack>
                <InteractiveButtonBox
                    visualViewportBottomOffset={visualViewportBottomOffset}
                    bgColour={bgColour}
                >
                    <Center>
                        <StyledBtn
                            isLoading={isApplyingDetails}
                            disabled={
                                (firstName == "" || lastName == "") ||
                                (!isEMValid || email == "" || !email.includes("@") || !(email.includes("@") && email.split("@")[1].includes(".")) || email.split("@")[1].split(".")[email.split("@")[1].split(".").length - 1] == "") ||
                                (phoneNumber == "" || !isPNValid) ||
                                (profession == "")
                            }
                            onClick={() => {
                                setIsApplyingDetails.on();

                                setTimeout(() => {
                                    // If the password has already been configured, skip straight to confirmation page
                                    if (passwordHash !== "") return setRegistrationPhase(4);

                                    setRegistrationPhase(3);
                                }, 200);
                            }}
                        >Continue</StyledBtn>
                    </Center>
                </InteractiveButtonBox>
            </>) : (<></>)}
            {registrationPhase === 3 ? (<>
                <Stack gap="0px">
                    <Text color={textColour} fontFamily="Inter" fontSize="22px">Nearly there...</Text>
                    <Text color={textColour} fontFamily="Inter" width="95%" opacity=".75" fontSize="18px">Your new MChat profile is nearly ready to start using!</Text>
                </Stack>
                <Stack gap="18px">
                    <Stack gap="8px">
                        <Stack gap="2px">
                            <Text color={textColour}>Password</Text>
                            <InputGroup>
                                <ChakraInput height="38px" background="rgba(255, 255, 255, 0.04)" borderRadius="0" borderTop="none" borderLeft="none" borderRight="none" borderBottom={`1px solid var(--chakra-colors-accent-${colorVariantName})`} type={showPassword ? "text" : "password"} onChange={e => {
                                    // Check the password against the minimum requirements
                                    if (e.target.value.length >= 8) setPassCharLim.on();
                                    else setPassCharLim.off();

                                    let specCharState = false;

                                    const specialCharacters = ["#","@","'","\"","!","¬","`","£","$","%","^","&","*","(",")","_","-","+","=","[","]","{","}",":",";","~","<",",",">",".","?","/","\\","|"];

                                    for (const char of specialCharacters) {
                                        if (e.target.value.includes(char)) {
                                            specCharState = true;
                                            break;
                                        }
                                    }

                                    if (specCharState) setPassSpecial.on();
                                    else setPassSpecial.off();

                                    if (!identifyCriticalConsecutiveNumbers(e.target.value) && e.target.value.length >= 3) setPassConsec.on();
                                    else setPassConsec.off();

                                    const firstNameLower = firstName.toLowerCase();
                                    const lastNameLower = lastName.toLowerCase();

                                    // Try to convert a fancy name into a normal name
                                    // eg: d4v1d --> david
                                    //
                                    // This is used below to check if user's name is in the password
                                    const unspecialisedPassword = e.target.value
                                    .split("1").join("i")
                                    .split("!").join("i")
                                    .split("4").join("a")
                                    .split("@").join("a")
                                    .split("$").join("s")
                                    .split("5").join("s")
                                    .split("7").join("t")
                                    .split("9").join("g")
                                    .split("0").join("o")
                                    .split("8").join("b")

                                    if (unspecialisedPassword.length < 3) setPassName.off();
                                    else if (unspecialisedPassword.toLowerCase().includes(firstNameLower)) setPassName.off();
                                    else if (unspecialisedPassword.toLowerCase().includes(lastNameLower)) setPassName.off();
                                    else setPassName.on();

                                    setPasswordHash(getPasswordHash(e.target.value));
                                }} autoComplete="new-password" onFocus={() => { viewPortHandler?.forceUpdate(); }} width="100%" _focus={{}} _hover={{}} />
                                <InputRightElement marginRight="5px" marginTop="-1px" width='3.6rem'>
                                    <Button h='1.6rem' size='sm' onClick={setShowPassword.toggle}>
                                        {showPassword ? 'Hide' : 'Show'}
                                    </Button>
                                </InputRightElement>
                            </InputGroup>
                        </Stack>
                        <Stack gap="3px">
                            <Text textColor={textColour} fontSize="12px">Please make sure your password:</Text>
                            <PasswordRequirement isMet={passCharLim}>Uses at least 8 characters</PasswordRequirement>
                            <PasswordRequirement isMet={passSpecial}>Includes at least 1 special character</PasswordRequirement>
                            <PasswordRequirement isMet={passConsec}>Doesn't include more than 2 consecutive numbers</PasswordRequirement>
                            <PasswordRequirement isMet={passName}>Doesn't include your name</PasswordRequirement>
                        </Stack>
                    </Stack>
                    <Stack gap="2px">
                        <Text textColor={textColour}>Confirm Password</Text>
                        <ChakraInput height="38px" background="rgba(255, 255, 255, 0.04)" borderRadius="0" borderTop="none" borderLeft="none" borderRight="none" borderBottom={(passwordHash === confirmPasswordHash) ? `1px solid var(--chakra-colors-accent-${colorVariantName})` : "1px solid indianred"} onChange={e => {
                            setConfirmPasswordHash(getPasswordHash(e.target.value));
                        }} autoComplete="new-password" onFocus={() => { viewPortHandler?.forceUpdate(); }} type="password" width="100%" _focus={{}} _hover={{}} />
                    </Stack>
                </Stack>
                <InteractiveButtonBox
                    visualViewportBottomOffset={visualViewportBottomOffset}
                    bgColour={bgColour}
                >
                    <Center>
                        <StyledBtn
                            isLoading={isApplyingPassword}
                            disabled={!(passCharLim && passConsec && passSpecial && passwordHash == confirmPasswordHash)}
                            onClick={() => {
                                setIsApplyingPassword.on();

                                setTimeout(() => {
                                    setRegistrationPhase(4);
                                }, 200);
                            }}
                        >Continue</StyledBtn>
                    </Center>
                </InteractiveButtonBox>
            </>) : (<></>)}
            {registrationPhase == 4 ? (<>
                <Stack gap="0px">
                    <Text color={textColour} fontFamily="Inter" fontSize="22px">Final step!</Text>
                    <Text color={textColour} fontFamily="Inter" width="95%" opacity=".75" fontSize="18px">Please confirm your details below and make any changes necessary.</Text>
                </Stack>
                <Stack gap="12px">
                    <DetailsConfirmation name="Name" value={`${firstName} ${lastName}`} />
                    <DetailsConfirmation name="Email Address" value={`${email}`} />
                    <DetailsConfirmation name="Profession" value={`${profession}`} />
                    <DetailsConfirmation name="Phone Number" value={`${phoneNumber}`} />
                </Stack>
                <InteractiveButtonBox
                    visualViewportBottomOffset={visualViewportBottomOffset}
                    bgColour={bgColour}
                >
                    <Center>
                        <HStack
                            gap="10px"
                            width="100%"
                            marginLeft="24px"
                            marginRight="24px"
                        >
                            <StyledBtn
                                type="secondary"
                                marginLeft="0px"
                                marginRight="0px"
                                onClick={() => {
                                    // Make sure the continue button is not disabled
                                    setIsApplyingDetails.off();

                                    setTimeout(() => {
                                        setRegistrationPhase(2);
                                    }, 200);
                                }}
                            >Edit Details</StyledBtn>
                            <StyledBtn
                                marginLeft="0px"
                                marginRight="0px"
                                isLoading={isRegisteringAccount}
                                disabled={!(passCharLim && passConsec && passSpecial && passwordHash == confirmPasswordHash)}
                                onClick={() => {
                                    setIsRegisteringAccount.on();

                                    // Generate the account registration token
                                    // This token is used to verify the server and client have matching data as well as making it harder for an attacker to create accounts
                                    const regIdHash = SHA512((registrationKey ?? "00").split(":")[0].slice(0, (registrationKey ?? "00").split(":")[0].length-1)).slice(0, 16);
                                    const invCodeHash = SHA512(inviteCode).slice(0, 24);
                                    const connIdHash = SHA512(uplink.connectionId).slice(0, 20);
                                    const passWHHash = SHA512(passwordHash).slice(0, 63);
                                    const passWCHHash = hash(confirmPasswordHash, 2).slice(0, 51);
                                    const firstNameHash = SHA512(firstName).slice(0, 12);
                                    const lastNameHash = SHA512(lastName).slice(0, 22);
                                    const emailHash = SHA512(email).slice(0, 33);
                                    const professionHash = SHA512(profession).slice(0, 35);
                                    const phoneNumHash = SHA512(phoneNumber).slice(0, 44);
                                    
                                    const token = [regIdHash, invCodeHash, connIdHash, passWHHash, passWCHHash, firstNameHash, lastNameHash, emailHash, professionHash, phoneNumHash];
                                    const tokenHash = SHA512(token.join(""));

                                    type AccountRegisterPayload = {
                                        token: string;
                                        passwordHash: string;
                                        firstName: string;
                                        lastName: string;
                                        email: string;
                                        profession: string;
                                        phoneNumber: string;
                                    };

                                    const payload: AccountRegisterPayload = {
                                        token: tokenHash,
                                        passwordHash,
                                        firstName,
                                        lastName,
                                        email,
                                        profession,
                                        phoneNumber,
                                    }

                                    setRegistrationPhase(5);
                                    setActiveAccCreationStep(0);

                                    uplink.pushFrameSync({
                                        type: "register",
                                        payload: JSON.stringify(payload),
                                    }, (frame, cb) => {
                                        if (frame.type == "error") {
                                            alert(frame.payload);
                                            return cb();
                                        }

                                        const stepBindings: {[key: string]: number} = {
                                            "verifying-account": 0,
                                            "generating-base-keys": 1,
                                            "registering-account": 2,
                                            "success": accountCreationSteps.length, // Set this be length of steps to ensure that the last element is checked off
                                        }

                                        if (frame.type == "register") {
                                            if (stepBindings[frame.payload as string]) setActiveAccCreationStep(stepBindings[frame.payload as string]);
                                        }
                                    }, accountCreateResponseFrameId);
                                }}
                            >Continue</StyledBtn>
                        </HStack>
                    </Center>
                </InteractiveButtonBox>
            </>) : (<></>)}
            {registrationPhase == 5 ? (<>
                <Stack gap="0px">
                    <Text color={textColour} fontFamily="Inter" fontSize="22px">{activeAccCreationStep == accountCreationSteps.length ? "Account Created!" : "Creating account!"}</Text>
                    <Text color={textColour} fontFamily="Inter" width="95%" opacity=".75" fontSize="18px">{activeAccCreationStep == accountCreationSteps.length ? "Welcome to MChat, your account has now been created!" : "Your MChat account is now being created, this shouldn't take long!"}</Text>
                </Stack>
                <Stepper index={activeAccCreationStep} orientation="vertical" gap="0" size="lg" colorScheme="purple" height="250px">
                    {accountCreationSteps.map((step, index) => (
                        <Step key={index}>
                        <StepIndicator>
                            <StepStatus
                                complete={<StepIcon />}
                                incomplete={<TimeIcon opacity=".6" />}
                                active={<Spinner size="sm" />}
                            />
                        </StepIndicator>

                        <Box flexShrink='0'>
                            <StepTitle>{step.title}</StepTitle>
                            <StepDescription>{step.description}</StepDescription>
                        </Box>

                        <StepSeparator />
                        </Step>
                    ))}
                </Stepper>
                <InteractiveButtonBox
                    visualViewportBottomOffset={visualViewportBottomOffset}
                    bgColour={bgColour}
                >
                    <Center>
                        <StyledBtn
                            isLoading={activeAccCreationStep !== accountCreationSteps.length}
                            disabled={activeAccCreationStep !== accountCreationSteps.length}
                            onClick={async () => {
                                console.log("Requesting token through a secure tunnel!")
                                
                                const sessionKey = await uplink.startSecureTunnelLegacy();
                                
                                uplink.pushSecTunFrameSync({
                                    type: "s-claimregauth",
                                    payload: uplink.connectionId,
                                }, sessionKey, (frame, cb) => {
                                    if (frame.type == "error") {
                                        console.error("Failed to claim auth token from server. The request returned an error:", frame.payload, "error code:", frame.errorCode);

                                        uplink.closeSecureTunnel(sessionKey);

                                        return cb();
                                    }

                                    uplink.closeSecureTunnel(sessionKey);

                                    cb();

                                    (new TokenStorage(window.localStorage)).setToken(frame.payload as string);

                                    console.log("Received an auth token from the server!");
                                    flowCompleteCb();
                                    prouter.setPage("app");
                                });
                            }}
                        >Continue</StyledBtn>
                    </Center>
                </InteractiveButtonBox>
            </>) : (<></>)}
            {/* Registration phases starting 9X are for login pages */}
            {registrationPhase == 90 ? (<>
                <Stack gap="0px">
                    <Text color={textColour} fontFamily="Inter" fontSize="22px">Welcome back!</Text>
                    <Text color={textColour} fontFamily="Inter" width="95%" opacity=".75" fontSize="18px">We're glad to see you again!</Text>
                </Stack>
                <Stack gap="18px">
                    <Stack gap="2px">
                        <Text color={textColour}>Phone Number</Text>
                        <InputGroup width="100%">
                            <InputLeftAddon
                                height="38px"
                                width="54px"
                                paddingLeft="10px"
                                color={textColour}
                                borderBottom={`1px solid ${isPNValid ? `var(--chakra-colors-accent-${colorVariantName})` : "indianred"}`}
                                borderRight="none"
                                borderRadius="0"
                                background="rgba(255, 255, 255, 0.08)"
                                transition=".25s"
                            >+44</InputLeftAddon>
                            <Input onFocus={() => {
                                viewPortHandler!.forceUpdate();
                                onLoginErrorClose();
                            }} valid={isPNValid ? 1 : 0} value={parsePhoneNumber(phoneNumber, "GB")?.formatNational()} width="100%" type="tel" autoComplete="tel" addonposition="left" onChange={e => {
                                const pn = parsePhoneNumber(e.target.value, "GB");

                                setPhoneNumber((pn?.number ?? "").toString());

                                if (pn?.isPossible()) setIsPNValid.on();
                                else setIsPNValid.off();

                                e.target.value = new AsYouType('GB').input(e.target.value);
                            }} height="38px" maxLength={15} />
                        </InputGroup>
                    </Stack>
                    <Stack gap="2px">
                        <Text textColor={textColour}>Password</Text>
                        <ChakraInput height="38px" background="rgba(255, 255, 255, 0.04)" borderRadius="0" borderTop="none" borderLeft="none" borderRight="none" borderBottom={`1px solid var(--chakra-colors-accent-${colorVariantName})`} onChange={e => {
                            setPasswordHash(getPasswordHash(e.target.value));
                        }} autoComplete="current-password" onFocus={() => {
                            viewPortHandler!.forceUpdate();
                            onLoginErrorClose();
                        }} type="password" width="100%" _focus={{}} _hover={{}} />
                    </Stack>
                </Stack>
                <InteractiveButtonBox
                    visualViewportBottomOffset={visualViewportBottomOffset}
                    bgColour={bgColour}
                >
                    <Popover
                        returnFocusOnClose={false}
                        isOpen={isLoginErrorOpen}
                        onClose={onLoginErrorClose}
                        placement='top'
                        closeOnBlur={false}
                    >
                        <PopoverTrigger>
                            <Center>
                                <StyledBtn
                                    // Reuse this state from eariler, no need to create extra states
                                    isLoading={isApplyingDetails}
                                    disabled={
                                        (phoneNumber == "" || !isPNValid) ||
                                        (passwordHash == "")
                                    }
                                    onClick={() => {
                                        setIsApplyingDetails.on();
                                        onLoginErrorClose();

                                        const payload: CreateAuthPayload = { phoneNumber, passwordHash }

                                        setTimeout(() => {
                                            uplink.pushSecTunFrameSync({
                                                type: "s-createauth",
                                                payload: JSON.stringify(payload),
                                            }, STunSessionKey, async (frame, cb) => {
                                                setIsApplyingDetails.off();

                                                uplink.closeSecureTunnel(STunSessionKey);
                                                
                                                cb();

                                                if (frame.type !== "s-createauth") {
                                                    console.log("Invalid login credentials, regenerating secure tunnel!")
                                                    setSTunSessionKey(await uplink.startSecureTunnelLegacy());

                                                    console.error("Received an unexpected \"createauth\" response! Raw frame:", frame);

                                                    setLoginErrMsg(frame.payload as string);
                                                    onLoginErrorOpen();

                                                    return;
                                                }
                                                
                                                (new TokenStorage(window.localStorage)).setToken(frame.payload as string);

                                                console.log("Received an auth token from the server!");
                                                flowCompleteCb();
                                                prouter.setPage("app");
                                            });
                                        }, 200);
                                    }}
                                >Continue</StyledBtn>
                            </Center>
                        </PopoverTrigger>
                        <PopoverContent
                            bg={`popover.${colorVariantName}`}
                            borderColor={`var(--chakra-colors-accent-${colorVariantName})`}
                            marginBottom="5px"
                        >
                            <PopoverHeader fontWeight='semibold'>Unable to login</PopoverHeader>
                            <PopoverArrow bg={`popover.${colorVariantName}`} />
                            <PopoverBody>
                                {loginErrMsg}
                            </PopoverBody>
                            <PopoverFooter display='flex' justifyContent='flex-start'>
                                <Link href="#" textDecoration="underline" onClick={() => {
                                    // Take user to the account recovery flow
                                    // prouter.setPage("recovery");

                                    alert("Sorry, account recovery is not yet available!")
                                }} fontSize="14px">Help, I forgot my password!</Link>
                            </PopoverFooter>
                        </PopoverContent>
                    </Popover>
                </InteractiveButtonBox>
            </>) : (<></>)}
        </Stack>
    </Box>);
}
