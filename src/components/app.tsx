import PageRouter from "@/lib/page-router";
import { Uplink } from "@/lib/uplink";
import User, { PublicUserAccount } from "@/lib/usrlib";
import { MessageAuthority } from "@/lib/encryption";
import { Text, Image, useColorModeValue, Center, Spinner, Box, HStack, VStack, Button, useDisclosure, Stack, Avatar } from "@chakra-ui/react";
import { Input } from "./mchat-input";
import { use, useEffect, useState } from "react";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import Jdenticon from "react-jdenticon";
import { PinInput } from "./pin-input";
import parsePhoneNumber from "libphonenumber-js";
import React from "react";
import { createHash } from "crypto";
import { GravatarQuickEditorCore } from '@/lib/gravatar';
import aleaRNGFactory from "number-generator/lib/aleaRNGFactory";
import { NewCasePage } from "./new-case-page";
import { SmallAddButton } from "./small-add-btn";
import { TokenStorage } from "@/lib/tokens";
import { AddToCirclePage } from "./add-to-circle";
import { Modal } from "./modal";
import { UserLookupResult, UserLookupResultType } from "./user-lookup-result";
import { sha256 } from "@daotl/cryptico";
import { VisualKeyVerification } from "./key-verification";
import { CaseMeta, Conversation } from "./conversation";
import { ConversationResponse as ConvoType, ConversationHandler, MessageSuperObj, Conversation as ConvoDataType } from "@/lib/convo";
import { CaseListItem } from "./case-list-item";

export function UIApp({
    uplink,
    prouter,
    user,
}: Readonly<{
    uplink: Uplink,
    prouter: PageRouter,
    user: User,
}>) {
    const [cState, setCState] = useState<string>("");
    const [perfMsg, setPerfMsg] = useState<string>("");
    const [encReadyState, setEncReadyState] = useState<"waiting" | "invalid" | "valid" | "authorised">("waiting");
    const [pinEntryError, setPinEntryError] = useState<boolean>(false);
    const [encryption, setEncryption] = useState<MessageAuthority>();
    const [isPinProcessing, setIsPinProcessing] = useState<boolean>(false);
    const [currentPage, setCurrentPage] = useState<string>("cases");
    const [currentPageTitle, setCurrentPageTitle] = useState<string>("Cases");
    const [prevPage, setPrevPage] = useState<string>("");
    const [pageSwitcherActive, setPageSwitcherActive] = useState<boolean>(false);
    const [gravatarQuickEditor, setGravatarQuickEditor] = useState<GravatarQuickEditorCore | undefined>();
    const [modalTitle, setModalTitle] = useState<string>("");
    const [modalContent, setModalContent] = useState<JSX.Element>(<></>);
    const [conversationHeader, setConversationHeader] = useState<JSX.Element | undefined>();
    const [conversationUser, setConversationUser] = useState<PublicUserAccount | undefined | null>();
    const [conversation, setConversation] = useState<ConvoType | undefined>();
    const [activeCaseMeta, setActiveCaseMeta] = useState<CaseMeta | undefined>();
    const [cases, setCases] = useState<{
        convo: ConvoDataType;
        lastMessage: {
            text: string;
            lastUpdated: number;
            creatorNameText :string
        }
    }[]>([]);
    const [modalPBtn, setModalPBtn] = useState<{ text: string; callback: () => void } | undefined>();
    const [modalSBtn, setModalSBtn] = useState<{ text: string; callback: () => void } | undefined>();
    const [gravatarHash, setGravatarHash] = useState<string>("");
    const [pfpCacheBuster, setPfpCacheBuster] = useState<string>(new Date().getTime().toString());
    const [conversationActivityStatus, setConversationActivityStatus] = useState<string>("Loading activity status");

    const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclosure();

    const hash = (d: string, rounds: number = 1) => {
        let hash = "";

        for (let i = 0; i < rounds; i++) {
            hash = createHash("sha512").update(hash == "" ? d : hash).digest("hex");
        }

        return hash;
    }

    const iterateHash = (data: string, rounds: number, seedOffset?: number) => {
        if (seedOffset) Math.abs(seedOffset);
        else seedOffset = 0;

        for (let i = 0; i < rounds; i++) {
            const indexStr = i.toString();
    
            // initialSeed must be >= 2
            const indexedPRNG = aleaRNGFactory(i + seedOffset + 2);
    
            // Add aditional complexity to random hash generation
            const delimiterType = ((data.length + rounds + i) % 2) ? "-" : ".";
    
            // This provides 2 PRNG numbers with a varying delimiter
            const PRNGFactors = [indexedPRNG.uInt32().toString(), indexedPRNG.uInt32().toString()].join(delimiterType);
    
            const hashFactors = [data, indexStr, "mchat", hash(indexStr), hash(PRNGFactors)];
    
            data = hash(hashFactors.join("-"));
        }
    
        return data;
    }

    prouter.on("ccsc", d => {
        setCState(d);
    });

    const setStatusBarColour = (colour: string) => {
        const themeColour = document.querySelector("meta[name=theme-color]");
        themeColour?.setAttribute("content", colour);
    }

    const colorVariantName = useColorModeValue("light", "dark");
    
    useEffect(() => {
        setStatusBarColour("#2E2942");

        // Fallback connection state checks
        setTimeout(() => {setCState(window.localStorage.getItem("m.iuid") ?? "offline")}, 1e3);
        setTimeout(() => {setCState(window.localStorage.getItem("m.iuid") ?? "offline")}, 2500);
        setTimeout(() => {setCState(window.localStorage.getItem("m.iuid") ?? "offline")}, 5e3);

        // Setup receiving message update notifications
        uplink.setMessageUpdateHandler(async (msg) => {
            // TODO: Show a notification for new messages
        });
    }, []);

    useEffect(() => {
        // Extra actions to perform when page switched

        if (currentPage == "circle") {
            // Reset conversation states (since we are no longer in a conversation)
            setConversationHeader(undefined);
            setConversationUser(undefined);
            setConversation(undefined);
        }
    }, [currentPage]);

    useEffect(() => {
        if (encReadyState == "authorised")
            setStatusBarColour("#40365E");
        else
            setStatusBarColour("#2E2942");
    }, [encReadyState]);

    useEffect(() => {
        setPerfMsg(
            cState == "offline" ? "Connecting..." :
            cState == "bug" ? "Still connecting..." :
            cState == "down" ? "This is taking longer than usual..." :
            cState == "no-internet" ? "You appear to be offline!" :
            cState == "delayed" ? "We are still attempting to connect you!" :
            cState == "outage" ? "Unable to connect!" :
            cState == "active" ? "" : ""
        )
    }, [cState]);

    useEffect(() => {
        if (user.isLoggedIn) {
            // Check if encryption is available for this user and verify pin, if not then prompt the user to configure it
            user.getEncryptionAvailability().then((d) => {
                const gravEditor = new GravatarQuickEditorCore({
                    email: user.email,
                    scope: ["avatars"],
                    onProfileUpdated: () => {
                        gravEditor.close();
                        setPfpCacheBuster(new Date().getTime().toString());
                    }
                });
                
                setGravatarHash(createHash("sha256").update(user.email.toLowerCase().trim()).digest("hex"));
                setGravatarQuickEditor(gravEditor);

                const cb = () => {
                    // Make sure the remote server knows our auth token
                    uplink.setUserAuthToken(user.getToken())
                    .then(() => {
                        setEncReadyState(d.configured ? "valid" : "invalid");
                    });

                    uplink.setAuthResyncCb(() => {
                        return user.getToken();
                    });
                }

                if (!uplink.isReady) {
                    uplink.on("ready", cb);
                } else {
                    cb();
                }
            })
            .catch((ex) => {
                console.error("Failed to fetch user account encryption availability, error:", ex);
                setEncReadyState("waiting");

                // TODO: Retry?
            });
            
        }
    }, [user.isLoggedIn]);

    // Workaround for issue with conversation header not updating conversation status
    useEffect(() => {
        // Dont try overwrite conversation header if we just reomved it (such as clicking back to prev page)
        if (!conversationHeader)
            return;

        if (conversation?.type == "case" && activeCaseMeta) {
            setConversationHeader(<>
                <UserLookupResult
                    firstName={activeCaseMeta.patientName}
                    profession={conversationActivityStatus}
                    imageElement={<Avatar width="44px" height="44px" name={activeCaseMeta.patientName} />}
                    userId=""
                    lastName=""
                    gravatarHash=""
                    firstItem
                    onClick={() => { }}
                />
            </>);

            return;
        }

        if (conversationUser) {
            setConversationHeader(<>
                <UserLookupResult
                    userId={conversationUser.id}
                    firstName={conversationUser.firstName}
                    lastName={conversationUser.lastName}
                    profession={conversationActivityStatus}
                    gravatarHash={conversationUser.gravatarHash}
                    firstItem
                    onClick={() => { }}
                />
            </>);
        }
    }, [conversationActivityStatus, conversationUser]);

    const loadUserCases = async () => {
        const res = await uplink.pushFrame({
            type: "list-cases",
            payload: "",
        });

        if (res.type !== "list-cases")
            throw new Error("Unexpected list-cases response, response:" + JSON.stringify(res));

        const data = JSON.parse(res.payload as string) as ConvoDataType[];

        console.log("Loaded", data.length, "case" + (data.length == 1 ? "" : "s"));

        let processed: typeof cases = [];

        for (const unprocessedCase of data) {
            const convo = new ConversationHandler(
                unprocessedCase.id,
                uplink,
                new TokenStorage(window.localStorage),
                encryption!,
                user,
            );

            const latestSecuredMessage = await convo.loadConversation(1);

            let latestState: {
                text: string;
                lastUpdated: number;
                creatorNameText: string;
            } = {
                text: "",
                lastUpdated: -1,
                creatorNameText: "",
            };

            try {
                // Decrypt this the latest message if available (and possible)
                if (encryption && latestSecuredMessage && latestSecuredMessage.messages.length >= 1) {
                    const latestMessage = encryption.decryptSuperMessages(user, latestSecuredMessage);

                    if (latestMessage && latestMessage.length >= 1&& latestMessage[0].data) latestState = {
                        text: latestMessage[0].data.plaintext,
                        lastUpdated: latestMessage[0].data.sentAt,
                        creatorNameText: ""
                    };
                }
            } catch (ex) {
                latestState.text = "Failed to load preview";
                
                console.error("Failed to decrypt preview message, error:", ex);
            }

            try {
                const creatorRes = await uplink.pushFrame({
                    type: "lookup-user",
                    payload: unprocessedCase.metadata["createdBy"],
                });

                if (creatorRes.type == "lookup-user") {
                    const results = JSON.parse(creatorRes.payload as string) as UserLookupResultType[];

                    if (unprocessedCase.metadata["createdBy"] == user.id) {
                        latestState = { ...latestState, creatorNameText: "" };
                    } else if (results.length >= 1 && results[0].firstName.length >= 4) {
                        latestState = { ...latestState, creatorNameText: results[0].firstName };
                    } else if (results.length >= 1 && results[0].firstName.length < 4) {
                        // Display first + last name if first name is very short (could be Mr. etc)
                        latestState = { ...latestState, creatorNameText: results[0].firstName };
                    }
                }
            } catch (ex) {
                console.error("Failed to load case creator information, error:", ex);
            }

            processed.push({
                convo: unprocessedCase,
                lastMessage: latestState,
            });
        }

        setCases(processed);
    }

    const completeHybridKeyPairChallenge = (challenge: string, encryption: MessageAuthority ) => {
        const secSign = encryption.rsa!.signString(challenge + hash(encryption.privateKey.publicKey + "|" + encryption.derivations.primaryKey.publicKey) + hash(encryption.derivations.primaryKey.publicKey) + encryption.privateKey.keyId, "sha256");
        const priSign = encryption.rsaPrimaryKey!.signString(challenge + hash(encryption.privateKey.publicKey + "|" + encryption.derivations.primaryKey.publicKey) + hash(encryption.privateKey.publicKey) + encryption.derivations.primaryKey.keyId, "sha256");
        
        return Buffer.from([secSign, priSign].join("|")).toString("base64");
    }

    useEffect(() => {
        if (encryption && encReadyState == "invalid") {
            if (!encryption.rsa) {
                console.error("Attempted to enroll encryption key without a valid RSA keypair");
                setIsPinProcessing(false);

                return;
            }

            // The user has setup an encryption key, we need to register it with the server
            console.log("Encryption utilities are ready, requesting a key enroll challenge from the server...");

            // TODO: Need to add someway to resume session incase key generation takes too long and socket times out

            const enrollPayload = [
                encryption.privateKey.publicKey,
                encryption.derivations.primaryKey.publicKey,
            ];

            uplink.pushFrameSync({
                type: "enroll-encryption",
                payload: Buffer.from(enrollPayload.join("|")).toString("base64"),
            }, (frame, cb) => {
                const challenge = frame.payload as string;

                if (!challenge.startsWith("challenge:")) {
                    setIsPinProcessing(false);
                    
                    throw new Error("Invalid challenge response from server");
                }

                const challengeData = challenge.split(":")[1];

                // Sign the challenge to prove we own the private key
                const sig = completeHybridKeyPairChallenge(challengeData, encryption);

                console.log(sig);

                uplink.pushFrameSync({
                    type: "enroll-encryption",
                    payload: sig,
                }, async (frame, cb) => {
                    const status = frame.payload as string;

                    if (status.startsWith("success:")) {
                        console.log("Successfully enrolled encryption key with server!");

                        try {
                            const newToken = await uplink.claimToken(status.split("success:")[1])

                            const tokStore = new TokenStorage(window.localStorage);

                            tokStore.setToken(newToken);

                            const tempEnc = encryption;

                            // Encryption keypair is now enrolled (and verified), verify it
                            setEncReadyState("valid");
                            setEncryption(undefined);

                            setTimeout(() => {
                                setEncryption(tempEnc);
                            }, 150);

                            // Return early as we still want the loading screen
                            return;
                        } catch (ex) {
                            console.error("Failed to update JWT auth token with public key, error:", ex);
                            setEncReadyState("invalid");
                        }
                    } else {
                        console.error("Failed to enroll encryption key with server, got an unexpected frame:", frame);
                        setEncReadyState("invalid");
                    }

                    // setIsPinProcessing(false);

                    cb();
                }, frame.frameId);

                cb();
            });
        } else if (encryption && encReadyState == "valid") {
            if (!encryption.rsa) {
                console.error("Attempted to verify encryption key without a valid RSA keypair");
                setIsPinProcessing(false);

                return;
            }

            // Encryption is setup, verify pin with server
            console.log("Encryption utilities are ready, requesting a key verification challenge from the server...");

            uplink.pushFrameSync({
                type: "verify-encryption",
                payload: "",
            }, (frame, cb) => {
                const challenge = frame.payload as string;

                if (!challenge.startsWith("challenge:")) {
                    setIsPinProcessing(false);
                    
                    throw new Error("Invalid challenge response from server");
                }

                const challengeData = challenge.split(":")[1];

                // Sign the challenge to prove we own the private key
                const sig = completeHybridKeyPairChallenge(challengeData, encryption);

                uplink.pushFrameSync({
                    type: "verify-encryption",
                    payload: sig,
                }, async (frame, cb) => {
                    const status = frame.payload as string;

                    if (status.startsWith("success:")) {
                        console.log("Successfully verified encryption key with server!");

                        try {
                            const newToken = await uplink.claimToken(status.split("success:")[1])

                            const tokStore = new TokenStorage(window.localStorage);

                            tokStore.setToken(newToken);

                            await loadUserCases();

                            // Encryption keypair is now enrolled (and verified), we can now use it to encrypt/decrypt messages
                            setEncReadyState("authorised");
                        } catch (ex) {
                            console.error("Failed to update JWT auth token with public key, error:", ex);
                            setEncReadyState("invalid");
                        }
                    } else {
                        console.error("Failed to verify encryption key with server, got an unexpected frame:", frame);
                        
                        // Set encReadyState back to valid so the user can re-enter their pin
                        // This doesn't mean that the entered pin was valid!
                        setEncReadyState("valid");
                        setPinEntryError(true);
                    }

                    setIsPinProcessing(false);

                    cb();
                }, frame.frameId);

                cb();
            });
        }
    }, [encryption]);

    useEffect(() => {
        if (isModalOpen && encReadyState == "authorised")
            setStatusBarColour("#201b2f");
        else if (isModalOpen)
            setStatusBarColour("#171421");
        else if (!isModalOpen && encReadyState == "authorised")
            setStatusBarColour("#40365E");
        else
            setStatusBarColour("#2E2942");
    }, [isModalOpen]);

    useEffect(() => {
        if (conversationUser) {
            setConversationHeader(<>
                <UserLookupResult
                    userId={conversationUser.id}
                    firstName={conversationUser.firstName}
                    lastName={conversationUser.lastName}
                    profession={conversationActivityStatus}
                    gravatarHash={conversationUser.gravatarHash}
                    firstItem
                    onClick={() => { }}
                />
            </>);
        }
    }, [conversationActivityStatus, conversationUser]);

    const onPinEntered = (pin: string) => {
        setIsPinProcessing(true);

        // Generate a hash for the pin
        const parsedPhoneNumber = parsePhoneNumber(user.phoneNumber, "GB");

        const phoneNum = (parsedPhoneNumber?.formatInternational() ?? user.phoneNumber);

        let seedOffset = 0;

        for (const char of (pin + user.id + user.phoneNumber + phoneNum + user.email + user.fullName)) {
            seedOffset += char.charCodeAt(0);
            const charNum = parseInt(char);

            if (!isNaN(charNum) && charNum > 0) {
                seedOffset += parseInt(char);
            }
        }

        seedOffset *= pin.length;

        // Entropy based on account details, so hash is different based on user account data
        const entropy = [user.id, (seedOffset / 2).toString(), phoneNum, user.email, user.fullName, user.entropy, user.registeredAt.getTime().toString()].join("+");
        const intermediaryHash = hash(pin + entropy, 5);

        const pinHash = iterateHash(intermediaryHash, 10, seedOffset);

        console.log("Configuring encryption utilities through MessageAuthority");

        // Add a delay so animations can load since MessageAuthority key generation is a blocking operation
        setTimeout(() => {
            setEncryption(new MessageAuthority([pinHash]));
        }, 250);
    }

    const pages: {
        name: string;
        id: string;
        indexed: boolean;
    }[] = [
        {
            name: "Cases",
            id: "cases",
            indexed: true,
        },
        {
            name: "Circle",
            id: "circle",
            indexed: true,
        },
        {
            name: "Expand Circle",
            id: "add-to-circle",
            indexed: false,
        },
        {
            name: "New Case",
            id: "new-case",
            indexed: false,
        },
        {
            name: "Teams",
            id: "teams",
            indexed: true,
        },
        {
            name: "Settings",
            id: "settings",
            indexed: true,
        },
        {
            name: "Edit Profile",
            id: "edit-profile",
            indexed: false,
        },
        {
            name: "",
            id: "conversation",
            indexed: false,
        }
    ];

    const priorityText: { [key: string]: string } = {
        "low": "Low",
        "med": "Medium",
        "high": "High",
    };

    const pageChanger = (id: string, prevPage?: string, dontResetConvoHeader?: boolean) => {
        let exists = false;
        let title = "";

        for (const page of pages) {
            if (page.id == id) {
                exists = true;
                title = page.name;
                break;
            }
        }

        if (!exists)
            throw new Error("Attempted to switch to page with id \"" + id + "\", but a page cannot be found with that id!");

        if (!dontResetConvoHeader) {
            setConversationHeader(undefined);
            setConversationUser(undefined);
        }

        if (id == "circle")
            user.refreshDetails();

        setCurrentPage(id);
        setCurrentPageTitle(title);
        setPrevPage(prevPage ?? "")
    }

    const handlePageMenuClick = () => {
        if (prevPage !== "")
            return pageChanger(prevPage);

        if (!pageSwitcherActive)
            setStatusBarColour("#30264E");
        else
            setStatusBarColour("#40365E");

        setPageSwitcherActive(!pageSwitcherActive);
    }

    const addNewItemPossiblePages = [
        "cases",
        "circle"
    ];

    const triggerModal = (title: string, content: JSX.Element, primaryButton?: {
        text: string;
        callback: () => void;
    }, secondaryButton?: {
        text: string;
        callback: () => void;
    }) => {
        setModalTitle(title);
        setModalContent(content);
        setModalPBtn(primaryButton);
        setModalSBtn(secondaryButton);

        onModalOpen();
    }

    const openCase = async (caseId: string) => {
        // no-op if encryption utilities are not ready
        if (!encryption)
            return;

        const convo = new ConversationHandler(caseId, uplink, new TokenStorage(window.localStorage), encryption, user);

        const secureMessages = await convo.loadConversation(20);

        setConversationUser(null);
        setConversation(secureMessages);
        pageChanger("conversation", "cases", true);
    }

    const openPrivateConversation = async (userId: string) => {
        // Find user's info from cached circle data
        let convoUser: PublicUserAccount | undefined = undefined;

        for (const u of user.circle) {
            if (u.id == userId) {
                convoUser = u;
                break;
            }
        }

        // TODO: Refresh cache if not found before displaying error

        if (!convoUser)
            return alert("Sorry, there was an issue opening that conversation! (target user not found in cache)");

        if (!encryption)
            return alert("Sorry, there was an issue opening that conversation! (encryption utilities were ready)");

        const convoPartySorted = [`${user.id}:${user.encryption?.keyId}`, `${convoUser.id}:${convoUser.encryption.keyId}`].sort();

        const convoId = sha256(`${convoPartySorted[0]}-${convoPartySorted[1]}`);

        const convoHandler = new ConversationHandler(convoId, uplink, new TokenStorage(window.localStorage), encryption, user);

        pageChanger("conversation", "circle", true);
        setConversationHeader(<>
            <UserLookupResult
                userId={convoUser.id}
                firstName={convoUser.firstName}
                lastName={convoUser.lastName}
                profession={conversationActivityStatus}
                gravatarHash={convoUser.gravatarHash}
                firstItem
                onClick={() => { }}
            />
        </>);

        // TODO: Display loading page while initiating conversation

        // Wait for UI to update (and animations to start) since this is a blocking operation
        setTimeout(async () => {
            let convoData = await convoHandler.loadConversation(20);

            if (!convoData) {
                // The conversation does not exist, create it
                convoData = await convoHandler.createConversation({
                    type: "private",
                    recipientsIds: [convoUser.id],
                    settings: {
                        ephermeral: false,
                    },
                    metadata: {},
                });
            }

            // TODO: Need better error handling (and displaying of error)
            
            // At this point, we were unable to load the data (or create the convo) so show error
            if (!convoData)
                return alert("Sorry, we were unable to load that conversation!");

            if (!setConversation)
                setConversationActivityStatus("Loading activity status");

            setConversationUser(convoUser);
            setConversation(convoData);
        }, 20);
    }

    return (<>
        <Modal
            title={modalTitle}
            isOpen={isModalOpen}
            onOpen={onModalOpen}
            onClose={onModalClose}
            primaryButton={modalPBtn}
            secondaryButton={modalSBtn}
        >
            {modalContent}
        </Modal>

        <Box
            height={perfMsg == "" ? "0px" : "28px"}
            paddingTop={perfMsg == "" ? "0px" : "10px"}
            paddingLeft="20px"
            paddingRight="20px"
            transition=".4s"
            background="inherit"
            color={perfMsg == "" ? "transparent" : "rgba(255, 255, 255, 0.5)"}
        >
            <HStack gap="8px">
                {/* Run these animations a bit faster than the wrapper animation */}
                <InfoOutlineIcon transition=".3s" opacity={perfMsg == "" ? "0" : "1"} />
                <Text transition=".3s" opacity={perfMsg == "" ? "0" : "1"}>{perfMsg == "" ? "Connected!" : perfMsg}</Text>
            </HStack>
        </Box>
        {user.isLoggedIn && encReadyState !== "waiting" && !isPinProcessing ? (<>
            <Box gap="20px" marginLeft="24px" marginRight="24px" marginTop={encReadyState == "authorised" ? "0px" : "20px"}>
                {encReadyState == "valid" ? (<>
                    {/* Validate user pin and setup MessageAuthority */}
                    <Center width="100%">
                        <PinInput
                            onPinEntered={onPinEntered}
                            onChange={() => {
                                if (pinEntryError) setPinEntryError(false);
                            }}
                            maxWidth="80%"
                            showPin={false}
                        >
                            <Text fontSize="24px" fontWeight="bold">MChat is locked</Text>
                            <Text fontSize="14px" opacity={pinEntryError ? ".85" : ".75"} color={pinEntryError ? "indianred" : "white"}>
                                {pinEntryError ? "Sorry, that pin is incorrect, please try again" : "MChat is currently locked, please enter your pin"}
                            </Text>
                        </PinInput>
                    </Center>
                </>) : encReadyState == "invalid" ? (<>
                    {/* Configure a pin for encryption */}
                    <Center width="100%">
                        <PinInput
                            onPinEntered={onPinEntered}
                            maxWidth="80%"
                            showPin={true}
                        >
                            <Text fontSize="24px" fontWeight="bold">Setup a pin</Text>
                            <Text fontSize="14px" opacity=".75">A pin is required to use your MChat account</Text>
                        </PinInput>
                    </Center>
                </>) : (<>
                    {/* The main user interface */}
                    <Box>
                        <Box
                            overflow="hidden"
                            width="100vw"
                            height="50%"
                            top="0"
                            left="0"
                            background="linear-gradient(180deg, rgba(164,128,255,1) 0%, rgba(164,128,255,0) 100%)"
                            opacity="0.15"
                            position="fixed"
                            zIndex="0"
                        />

                        <Image
                            src="/menu-bg.png"
                            position="absolute"
                            zIndex="9"
                            width={pageSwitcherActive ? "100%" : "75%"}
                            height={pageSwitcherActive ? "100%" : "75%"}
                            top={pageSwitcherActive ? "0px" : "-15px"}
                            left={pageSwitcherActive ? "0px" : "-25px"}
                            overflow="hidden"
                            transition=".3s"
                            userSelect="none"
                            opacity={pageSwitcherActive ? "1" : "0"}
                            style={{
                                WebkitTouchCallout: "none",
                            }}
                            backdropFilter="blur(2px)"
                            draggable={false}
                            pointerEvents="none"
                        />

                        <Box
                            position="fixed"
                            width="100vw"
                            height="100vh"
                            top="0"
                            left="0"
                            zIndex="8"
                            background="rgba(0, 0, 0, 0.2)"
                            opacity={pageSwitcherActive ? "1" : "0"}
                            transition=".3s"
                            pointerEvents="none"
                            overflow="hidden"
                        />

                        <HStack
                            width="100%"
                            height="100%"
                            marginLeft="0"
                            marginRight="0"
                            position="relative"
                        >
                            <Box position={conversationHeader ? "fixed" : "relative"} overflow="hidden">
                                <HStack
                                    gap="10px"
                                    onClick={handlePageMenuClick}
                                >
                                    <Image
                                        src="/chevron.svg"
                                        transform={pageSwitcherActive ? "rotate(180deg)" : prevPage !== "" ? "rotate(90deg)" : "rotate(0deg)"}
                                        transition=".3s"
                                        zIndex="10"
                                    />
                                    {conversationHeader ? conversationHeader : (
                                        <Text
                                            fontFamily="Inter"
                                            fontWeight="black"
                                            fontSize="36px"
                                            color="text.dark"
                                            zIndex="10"
                                            transition=".2s"
                                            whiteSpace="nowrap"
                                            opacity={pageSwitcherActive ? "0" : "1"}
                                            marginLeft={pageSwitcherActive ? "-10px" : ""}
                                        >{currentPageTitle}</Text>
                                    )}
                                </HStack>
                            </Box>
                            <VStack
                                position="absolute"
                                top="75px"
                                alignItems="normal"
                                pointerEvents={pageSwitcherActive ? "all" : "none"}
                            >
                                {pages.filter(v => {
                                    return v.indexed;
                                }).map((v, i) => {
                                    if (!v.indexed) return;

                                    return (<>
                                        <Text
                                            float="left"
                                            fontFamily="Inter"
                                            fontWeight={currentPage == v.id ? "bold" : "medium"}
                                            fontSize="36px"
                                            color="text.dark"
                                            zIndex="10"
                                            transition="margin .25s ease-out, opacity .2s"
                                            whiteSpace="nowrap"
                                            marginLeft={pageSwitcherActive ? "0" : "-75px"}
                                            opacity={pageSwitcherActive ? (currentPage == v.id ? "1" : "0.75") : "0"}
                                            // Increase transition delay as we go further down the list
                                            transitionDelay={pageSwitcherActive ? 0 + ((i + 1) / 12) + "s" : "0"}
                                            onClick={currentPage == v.id ? handlePageMenuClick : () => {
                                                pageChanger(v.id);
                                                handlePageMenuClick();
                                            }}
                                            userSelect="none"
                                        >{v.name}</Text>
                                    </>);
                                })}
                            </VStack>
                            <SmallAddButton
                                // alt="Create a new case"
                                onClick={() => {
                                    if (pageSwitcherActive)
                                        return;
                                    
                                    if (currentPage == "cases")
                                        pageChanger("new-case", "cases");
                                    else if (currentPage == "circle")
                                        pageChanger("add-to-circle", "circle");
                                }}
                                isCross={false}
                                scale={prevPage || !addNewItemPossiblePages.includes(currentPage) ? 0.65 : 1}
                                opacity={prevPage || !addNewItemPossiblePages.includes(currentPage) ? "0" : "1"}
                                active={prevPage == "" || !addNewItemPossiblePages.includes(currentPage)}
                                zIndex="7"
                            />
                        </HStack>
                        
                        <Box
                            // position="inherit"
                            pointerEvents={pageSwitcherActive ? "none" : "all"}
                            zIndex="5"
                            overflow="hidden"
                        >
                            {/* Cases page */}
                            {currentPage == "cases" && (<>
                                {cases.length == 0 ? (<>
                                    <Image
                                        src={`/add-new-case-indication-arrow.svg`}
                                        position="absolute"
                                        right="46px"
                                        top="48px"
                                    />
                                    <Text
                                        position="absolute"
                                        top="0"
                                        left="0"
                                        justifyContent="center"
                                        alignItems="center"
                                        display="flex"
                                        height="calc(100vh - 72px)"
                                        width="100vw"
                                        color="text.dark"
                                        margin="auto"
                                        textAlign="center"
                                        fontFamily="Inter"
                                        fontSize="16px"
                                        fontWeight="regular"
                                        zIndex="1"
                                    >
                                        There’s nothing to see here!
                                        <br />
                                        Why not try creating a new case?
                                    </Text>
                                </>) : (<>
                                    <Box marginTop="24px">
                                        {cases
                                        .sort((a, b) => {
                                            const aCreatedAt = a.convo.metadata["createdAt"] as number;
                                            const bCreatedAt = b.convo.metadata["createdAt"] as number;

                                            return bCreatedAt - aCreatedAt;
                                        })
                                        // Sort by priority: high, medium, low so that higher priority cases appear at the top
                                        .sort((a, b) => {
                                            const priorityOrder = { high: 1, med: 2, low: 3 };
                                            // If no priority data available make lowest possible
                                            const aPriority = priorityOrder[(a.convo.metadata as CaseMeta).priority] || 4;
                                            const bPriority = priorityOrder[(b.convo.metadata as CaseMeta).priority] || 4;

                                            // Return difference in priority
                                            return aPriority - bPriority;
                                        })
                                        .map((v) => {
                                            const meta = v.convo.metadata as CaseMeta;

                                            return (<CaseListItem
                                                user={user}
                                                patientName={meta.patientName}
                                                description={meta.shortDesc}
                                                convoId={v.convo.id}
                                                priority={meta.priority}
                                                lastState={v.lastMessage}
                                                onClick={async (convoId: string, patientName: string, priority: string) => {
                                                    console.log("Opening case with id:", convoId);

                                                    setActiveCaseMeta(meta);

                                                    await openCase(convoId);
                                                    setConversationActivityStatus(`${priorityText[priority]} priority`);
                                                    setConversationHeader(<>
                                                        <UserLookupResult
                                                            firstName={patientName}
                                                            profession={conversationActivityStatus}
                                                            imageElement={<Avatar width="44px" height="44px" name={patientName} />}
                                                            userId=""
                                                            lastName=""
                                                            gravatarHash=""
                                                            firstItem
                                                            onClick={() => { }}
                                                        />
                                                    </>);
                                                }}
                                            />);
                                        })}
                                    </Box>
                                </>)}
                            </>)}

                            {/* Create new case page */}
                            {currentPage == "new-case" && (
                                <NewCasePage
                                    uplink={uplink}
                                    messageAuthority={encryption!}
                                    onCaseCreate={async (data) => {
                                        setActiveCaseMeta({
                                            priority: data.priority as CaseMeta["priority"],
                                            patientName: data.patientName,
                                            shortDesc: data.shortDesc, 
                                        });
                                        await openCase(data.caseId);
                                        setConversationActivityStatus(`${priorityText[data.priority]} priority`);
                                        setConversationHeader(<>
                                            <UserLookupResult
                                                firstName={data.patientName}
                                                profession={conversationActivityStatus}
                                                imageElement={<Avatar width="44px" height="44px" name={data.patientName} />}
                                                userId=""
                                                lastName=""
                                                gravatarHash=""
                                                firstItem
                                                onClick={() => { }}
                                            />
                                        </>);
                                    }}
                                />
                            )}

                            {/* Circle page */}
                            {currentPage == "circle" && (<>
                                {user.circle.length == 0 ? (<>
                                    <Image
                                        src={`/add-new-case-indication-arrow.svg`}
                                        position="absolute"
                                        right="46px"
                                        top="48px"
                                    />
                                    <Text
                                        position="absolute"
                                        top="0"
                                        left="0"
                                        justifyContent="center"
                                        alignItems="center"
                                        display="flex"
                                        height="calc(100vh - 72px)"
                                        width="100vw"
                                        color="text.dark"
                                        margin="auto"
                                        textAlign="center"
                                        fontFamily="Inter"
                                        fontSize="16px"
                                        fontWeight="regular"
                                        zIndex="1"
                                    >
                                        You don't have anyone in your circle!
                                        <br />
                                        Why not try adding someone?
                                    </Text>
                                </>) : (<Box marginTop="24px">
                                    {user.circle.map((v, i) => {
                                        return (<UserLookupResult
                                            userId={v.id}
                                            firstItem={i == 0}
                                            firstName={v.firstName}
                                            lastName={v.lastName}
                                            profession={v.profession}
                                            gravatarHash={v.gravatarHash}
                                            onClick={() => {
                                                openPrivateConversation(v.id);
                                            }}
                                        />
                                        );
                                    })}
                                </Box>)}
                            </>)}

                            {/* Add to circle page */}
                            {currentPage == "add-to-circle" && (
                                <AddToCirclePage
                                    uplink={uplink}
                                    messageAuthority={encryption!}
                                    onComplete={async (userId) => {
                                        await user.refreshDetails();
                                        openPrivateConversation(userId);
                                    }}
                                />
                            )}

                            {/* Settings page */}
                            {currentPage == "settings" && (<>
                                <HStack gap="24px" marginTop="24px">
                                    <Image
                                        src={`https://gravatar.com/avatar/${gravatarHash}?d=identicon&t=${pfpCacheBuster}&s=80`}
                                        width="80px"
                                        height="80px"
                                        borderRadius="50%"
                                        background="rgba(255, 255, 255, 0.05)"
                                        draggable={false}
                                    />
                                    <Stack gap="0">
                                        <Text
                                            fontFamily="Inter"
                                            fontWeight="medium"
                                            fontSize="20px"
                                            color="text.dark"
                                        >{user.fullName}</Text>
                                        <Text
                                            fontFamily="Inter"
                                            fontWeight="regular"
                                            fontSize="18px"
                                            color="text.dark"
                                            opacity="0.75"
                                        >{user.profession}</Text>
                                        <Text
                                            fontFamily="Inter"
                                            fontWeight="regular"
                                            fontSize="14px"
                                            color="skyblue"
                                            opacity="0.75"
                                            onClick={() => {
                                                pageChanger("edit-profile", "settings");
                                            }}
                                        >Edit Profile</Text>
                                    </Stack>
                                </HStack>
                                <Box
                                    width="100%"
                                    height="1px"
                                    marginTop="24px"
                                    marginBottom="24px"
                                    background="rgba(255, 255, 255, 0.05)"
                                />
                                <Text
                                    fontFamily="Inter"
                                    fontWeight="bold"
                                    fontSize="24px"
                                    marginTop="-12px"
                                >
                                    Invite Colleagues
                                </Text>
                                <span>
                                    {user.inviteCode !== "" ? (<>
                                        <Text as="span">
                                            {"Your invite code is "}
                                        </Text>
                                        <Text as="span" color="accent.dark" fontWeight="medium">
                                            {user.inviteCode == "" ? "unavailable" : user.inviteCode}
                                        </Text>
                                        <Text as="span">
                                            {", share this with your colleagues during registration to expand your circle."}
                                        </Text>
                                    </>) : (<>
                                        <Text as="span">
                                            {"Sorry, your invite code is currently unavailable!"}
                                        </Text>
                                    </>)}
                                </span>
                                <Box
                                    width="100%"
                                    height="1px"
                                    marginTop="24px"
                                    marginBottom="24px"
                                    background="rgba(255, 255, 255, 0.05)"
                                />
                                <Text
                                    fontFamily="Inter"
                                    fontWeight="bold"
                                    fontSize="24px"
                                    marginTop="-12px"
                                >
                                    Key Verification
                                </Text>
                                {encryption?.privateKey.keyId ? (<Stack gap="20px">
                                    <Text as="span">
                                        {"Key verification is used to validate your identity on MChat. The unique pattern displayed below should match with the one displayed for your profile on the recipient's device."}
                                    </Text>
                                    <VisualKeyVerification keyId={encryption.privateKey.keyId} />
                                </Stack>) : (<>
                                    <Text as="span">
                                        {"Sorry, key verification is currently unavailable!"}
                                    </Text>
                                </>)}
                            </>)}

                            {/* Edit user profile page */}
                            {currentPage == "edit-profile" && (<>
                                <Text>Edit Profilekandfjandjksdnkjda</Text>
                                <Button
                                    onClick={() => {
                                        if (!gravatarQuickEditor) return;

                                        triggerModal("Gravatar Redirect", <>
                                            <Text>
                                                We use Gravatar to provide profile pictures, please confirm you would like to continue
                                            </Text>
                                        </>, {
                                            text: "Continue",
                                            callback: () => {
                                                onModalClose();
                                                gravatarQuickEditor.open();
                                            },
                                        }, {
                                            text: "Cancel",
                                            callback: onModalClose,
                                        });
                                    }}
                                >Test GQE</Button>
                            </>)}

                            {/* Conversation page */}
                            {currentPage == "conversation" && (<>
                                <Conversation
                                    convoId={conversation?.id ?? ""}
                                    uplink={uplink}
                                    msgAuth={encryption!}
                                    user={user}
                                    tokenStore={new TokenStorage(window.localStorage)}
                                    convoData={conversation!}
                                    onStatusUpdate={d => {
                                        console.log(d)
                                        setConversationActivityStatus(d);
                                    }}
                                    ready={(
                                        conversation != undefined &&
                                        // conversationUser === null when viewing a case
                                        ( conversationUser != undefined || conversationUser === null ) &&
                                        encryption != undefined &&
                                        user.isLoggedIn &&
                                        encReadyState == "authorised"
                                    )}
                                    onRefreshConvo={async (isPrivate: boolean, userId?: string) => {
                                        // Opening this conversation again causes messages to be reloaded
                                        
                                        console.log("onRefreshConvo:", isPrivate, userId)

                                        if (isPrivate && userId) {
                                            await openPrivateConversation(userId);
                                        } else if (conversation?.type == "case") {
                                            await openCase(conversation.id);
                                        } 
                                    }}
                                />
                            </>)}
                        </Box>
                    </Box>
                </>)}
            </Box>
        </>) : (<Center width="100%" height="100%">
            <Box position="relative">
                <Center><Spinner size="lg" width="160px" height="160px" /></Center>
                <Center
                    position="absolute"
                    left="0"
                    top="0"
                    width="100%"
                    height="100%"
                >
                    <Image
                        src={`/logo-clear-${colorVariantName}.svg`}
                        alt="MChat logo"
                        width="80px"
                        userSelect="none"
                        marginLeft="15px"
                    />
                </Center>
            </Box>
        </Center>)}
        {/* {cState}<br />{perfMsg} */}
    </>)
}
