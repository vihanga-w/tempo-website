import { ConversationHandler, ConversationResponse } from "@/lib/convo";
import { DecryptedMessage, MessageAuthority } from "@/lib/encryption";
import { TokenStorage } from "@/lib/tokens";
import { SecureUplink, Uplink } from "@/lib/uplink";
import User, { PublicUserAccount } from "@/lib/usrlib";
import { Box, HStack, Icon, Input, Spinner, Stack, Text, Center } from "@chakra-ui/react";
import { sha256 } from "@daotl/cryptico";
import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { FaChevronDown, FaPaperPlane } from "react-icons/fa6";

type MessageViewType = {
    sender: PublicUserAccount;
    message: DecryptedMessage;
};

export type CaseMeta = {
    patientName: string;
    shortDesc: string;
    priority: "low" | "med" | "high";
}

export function convertUserToPublicUserAccount(user: User): PublicUserAccount {
    return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        profession: user.profession,
        registeredAt: user.registeredAt.getTime(),
        gravatarHash: sha256(user.email.toLowerCase().trim()),
        encryption: {
            configured: user.encryption?.configured ?? false,
            keyId: user.encryption?.keyId ?? "",
            publicKey: user.encryption?.publicKey ?? "",
            primaryKey: user.encryption?.primaryKey ?? "",
        },
        lastSeenString: "now",
    };
}

const PulsingDot = ({ style }: { style?: React.CSSProperties }) => (
    <Box
        width="8px"
        height="8px"
        borderRadius="50%"
        backgroundColor="accent.dark"
        animation="pulsing 1s infinite"
        marginLeft="8px"
        alignSelf="center"
        style={style}
    />
);

const TypingIndicator = ({ users }: { users: {
    userId: string;
    firstName: string;
}[] }) => {
    const typingMessage = users.length === 1
        ? `${users[0].firstName} is typing...`
        : `${users.length} people are typing...`;

    return (
        <HStack spacing="8px" alignItems="center">
            {users.length > 0 && (<>
                <Box
                    width="8px"
                    height="8px"
                    borderRadius="50%"
                    backgroundColor="accent.dark"
                    animation="pulsing 1s infinite"
                    marginTop="2px"
                    marginLeft="4px"
                    marginRight="-4px"
                />
                <Text fontSize="sm" color="gray.300">{typingMessage}</Text>
            </>)}
        </HStack>
    );
};

const styles = `
@keyframes pulsing {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
}

.hide-scrollbar::-webkit-scrollbar {
    display: none;
}

.hide-scrollbar {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
}
`;

export function Conversation({
    convoId,
    uplink,
    tokenStore,
    msgAuth,
    user,
    convoData: initialConvoData,
    ready,
    onRefreshConvo,
    onStatusUpdate,
}: Readonly<{
    convoId: string;
    uplink: Uplink;
    tokenStore: TokenStorage;
    msgAuth: MessageAuthority;
    user: User;
    convoData: ConversationResponse;
    ready: boolean;
    onRefreshConvo: (isPrivate: boolean, userId?: string) => void;
    onStatusUpdate: (status: string) => void;
}>) {
    const [handler, setHandler] = useState<ConversationHandler | undefined>();
    const [isMsgSendReady, setIsMsgSendReady] = useState<boolean>(false);
    const [isMsgSending, setIsMsgSending] = useState<boolean>(false);
    const [messageToSend, setMessageToSend] = useState<string>("");
    const [cachedMessages, setCachedMessages] = useState<MessageViewType[]>([]);
    const [localMessages, setLocalMessages] = useState<MessageViewType[]>([]);
    const [isInitialDataProcessedView, setIsInitialDataProcessedView] = useState<boolean>(false);
    const [isInitialDataProcessed, setIsInitialDataProcessed] = useState<boolean>(false);
    const [typingUsers, setTypingUsers] = useState<{
        userId: string;
        firstName: string;
        timeout?: NodeJS.Timeout;
    }[]>([]);
    const [lastTypingNotification, setLastTypingNotification] = useState<number>(0);
    const [_userStatuses, setUserStatuses] = useState<{ [userId: string]: string }>({});
    const [initialLoad, setInitialLoad] = useState<boolean>(true);
    const [scrollDownBtnVisible, setScrollDownBtnVisible] = useState<boolean>(false);
    const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
    const [keychain, setKeychain] = useState<PublicUserAccount[] | undefined>();

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = (instant?: boolean, alwaysScroll?: boolean, ignoreCb?: () => void) => {
        const threshold = 280;

        const container = messagesEndRef.current?.parentElement;

        // Only trigger scroll to bottom if we are close to bottom of messages (in case user wants to view older messages)
        if (alwaysScroll || (container && container.scrollHeight - container.scrollTop - container.clientHeight < threshold)) {
            messagesEndRef.current?.scrollIntoView({ behavior: instant ? "auto" : "smooth" });
        } else if (ignoreCb) {
            ignoreCb();
        }
    };

    uplink.setMessageUpdateHandler(async (msg) => {
        // onRefreshConvo(initialConvoData.type == "private", initialConvoData.parties.filter(p => p.userId !== user.id)[0].userId);
        refreshCb();
    }, convoId);

    useEffect(() => {
        uplink.setMessageUpdateHandler(async (msg) => {
            // onRefreshConvo(initialConvoData.type == "private", initialConvoData.parties.filter(p => p.userId !== user.id)[0].userId);
            refreshCb();
        }, convoId);
        console.log(ready)
    }, [isInitialDataProcessed]);

    useEffect(() => {
        scrollToBottom(!isInitialDataProcessedView, !isInitialDataProcessedView, () => {
            // We got a new message but ignored it since we are scrolled up
            setUnreadMessagesCount(prev => {
                return prev + 1;
            });
        });
    }, [localMessages, cachedMessages]);

    useEffect(() => {
        if (localMessages.length == 0)
            return;

        // Make sure we smoothly scroll to bottom of screen when we send a message
        scrollToBottom(false, true);
    }, [localMessages]);

    const getUserFromCircleCache = (userId: string) => {
        if (userId == user.id) {
            // This is us, we are not in our own circle so generate a valid public user account object
            return convertUserToPublicUserAccount(user);
        }

        const circle = keychain || user.circle;

        const filtered = circle.filter((u) => u.id === userId);

        if (filtered.length === 0)
            return undefined;

        return filtered[0];
    }

    useEffect(() => {
        if (!initialConvoData)
            return;

        setCachedMessages((prev) => {
            let msgs: MessageViewType[] = prev;

            const prevMsgIds = prev.map(p => p.message.id);

            // We only want to decrypt new messages, dont waste time decrypting already processed ones
            initialConvoData.messages = initialConvoData.messages.filter(v => !prevMsgIds.includes(v.code.messageId));

            setHandler(new ConversationHandler(convoId, uplink, tokenStore, msgAuth, user, keychain));

            const initialMessages = msgAuth.decryptSuperMessages(user, initialConvoData, keychain);

            if (!initialMessages)
                return msgs;

            let processed: MessageViewType[] = [];

            for (const msg of initialMessages) {
                if (!msg.data) {
                    console.warn("Message data is missing from the message object:", msg);
                    continue;
                }

                // Check if we already pocessed messsage with same id
                if (processed.filter(v => v.message.id === msg.data?.id).length > 0)
                    continue;

                // Get the sender of the message from our circle cache
                const sender = getUserFromCircleCache(msg.data.senderId);

                if (!sender) {
                    console.warn("Sender data is missing from the message object:", msg);
                    continue;
                }

                // Add the message to the processed list
                processed.push({
                    sender,
                    message: msg.data,
                });
            }

            for (const newMsg of processed) {
                // Add new messages we have not already got
                if (!msgs.find(v => v.message.id == newMsg.message.id))
                    msgs.push(newMsg);
            }

            // Remove local which have a hash of message plaintext that matches a message in the cache
            // Since these messaged have now been sent
            setLocalMessages(localMessages.filter(localMsg => {
                return processed.filter(cacheMsg => {
                    // meta.checksum is hash of metadata which will be different for each message
                    // so calculate hash of plaintext message and compare
                    return sha256(cacheMsg.message.plaintext) === sha256(localMsg.message.plaintext);
                }).length === 0;
            }));

            setIsInitialDataProcessed(true);

            setTimeout(() => {
                setIsInitialDataProcessedView(true);
            }, 20);

            return msgs;
        });
    }, [initialConvoData, keychain]);

    useEffect(() => {
        const handleTyping = (userId: string, shouldCancel?: boolean) => {
            if (shouldCancel) {
                // Remove timeout and user from typing list
                if (typingUsers.find((u) => u.userId === userId)?.timeout)
                    clearTimeout(typingUsers.find((u) => u.userId === userId)!.timeout);

                setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
                return;
            }

            setTypingUsers((prev) => {
                // If the previous state already contains the user, reset the timeout
                const existingUser = prev.find((u) => u.userId === userId);
                if (existingUser) {
                    clearTimeout(existingUser.timeout);
                    return prev.map((u) =>
                        u.userId === userId
                            ? { ...u, timeout: setTimeout(() => {
                                setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
                            }, 5000) }
                            : u
                    );
                }

                // Get the user object from the circle cache
                const user = getUserFromCircleCache(userId);

                // User was not found in cache, return previous state
                // no need for an error message since this isnt mission critical
                if (!user) return prev;

                // Add the user to the typing list with a timeout
                return [
                    ...prev,
                    {
                        userId: user.id,
                        firstName: user.firstName,
                        timeout: setTimeout(() => {
                            setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
                        }, 2e3),
                    },
                ];
            });
        };

        uplink.setTypingHandler(handleTyping, convoId);

        const getLastSeenStatus = (timestamp: number): string => {
            const now = new Date();
            const lastSeen = new Date(timestamp);
            const diffInMinutes = Math.floor((now.getTime() - lastSeen.getTime()) / 60e3);
        
            if (diffInMinutes < 5) {
                return "Active recently";
            } else if (diffInMinutes < 60) {
                return `Last seen ${diffInMinutes} minutes ago`;
            } else if (diffInMinutes < 1080) {
                return `Last seen ${Math.floor(diffInMinutes / 60)} hour${Math.floor(diffInMinutes / 60) == 1 ? "" : "s"} ago`;
            } else if (now.toDateString() === lastSeen.toDateString()) {
                return "Last seen today";
            } else if (diffInMinutes < 10080) {
                const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                return `Last seen on ${daysOfWeek[lastSeen.getDay()]}`;
            } else {
                return `Last seen ${Math.floor(diffInMinutes / 1440)} days ago`;
            }
        };

        const setUserStatus = (processUser: {
            userId: string;
            factor: string;
        }, convoUser: PublicUserAccount) => {
            const isNum = !isNaN(parseInt(convoUser.lastSeenString));
            const lastSeenStatus = isNum ? getLastSeenStatus(parseInt(convoUser.lastSeenString)) : "Active now";

            setUserStatuses((prev) => {
                const newStatuses = {
                    ...prev,
                    [processUser.userId]: lastSeenStatus,
                };

                const activeUsers = Object.values(newStatuses).filter(status => status === "Active now").length;
                const statusMessage = activeUsers > 2 ? (activeUsers > 0 ? `${activeUsers} active now` : `${initialConvoData.parties.length} participants`) : lastSeenStatus;

                onStatusUpdate(statusMessage);

                return newStatuses;
            });
        }

        if (initialConvoData && initialConvoData.type == "private") {
            console.log("Loading private conversation");

            for (const processUser of initialConvoData.parties) {
                if (processUser.userId == user.id)
                    continue;

                if (initialLoad) {
                    setInitialLoad(false);

                    // Process the cached activity data
                    const convoUser = getUserFromCircleCache(processUser.userId);

                    if (convoUser)
                        setUserStatus(processUser, convoUser);
                }

                // Check if the handler already exists to prevent duplication
                if (uplink.hasUserActivityUpdateHandler(processUser.userId))
                    continue;

                uplink.setUserActivityUpdateHandler((status) => {
                    const isNum = !isNaN(parseInt(status));
                    const lastSeenStatus = isNum ? getLastSeenStatus(parseInt(status)) : "Active now";
                    
                    setUserStatuses((prev) => {
                        const newStatuses = {
                            ...prev,
                            [processUser.userId]: lastSeenStatus,
                        };

                        const activeUsers = Object.values(newStatuses).filter(status => status === "Active now").length;
                        const statusMessage = activeUsers > 2 ? (activeUsers > 0 ? `${activeUsers} active now` : `${initialConvoData.parties.length} participants`) : lastSeenStatus;

                        onStatusUpdate(statusMessage);

                        return newStatuses;
                    });
                }, processUser.userId);
            }
        } else if (initialConvoData && initialConvoData.type == "case" && initialLoad && handler) {
            console.log("Loading case");
        
            setInitialLoad(false);
            // onStatusUpdate()

            // TODO: Try find keychain in cache

            console.log("Keychain not found in cache, requesting it from uplink");

            const loadKeychain = async (tun: SecureUplink) => {
                const res = await tun.pushSecureFrame({
                    type: "s-loadkeychain",
                    payload: JSON.stringify({
                        convoId: initialConvoData.id,
                    }),
                });

                if (res.type !== "s-loadkeychain")
                    throw new Error("Failed to load keychain, unexpected uplink response: " + JSON.stringify(res));

                const keychain = JSON.parse(res.payload as string) as PublicUserAccount[];

                console.log("Got keychain:", keychain);

                handler.setGroupKeychain(keychain);
                setKeychain(keychain);
            }

            uplink.startSecureTunnel()
            .then(loadKeychain);

            // TODO: Register status update handlers
        }

        // Cleanup function to remove the typing handler and user activity update handlers when the component unmounts
        return () => {
            uplink.removeTypingHandler(convoId);
            
            if (initialConvoData) {
                for (const user of initialConvoData.parties) {
                    uplink.removeUserActivityUpdateHandler(user.userId);
                }
            }
        };
    }, [convoId, uplink, initialConvoData, onStatusUpdate, initialLoad, handler]);

    const refreshCb = () => {
        onRefreshConvo(initialConvoData.type == "private", initialConvoData.parties.filter(p => p.userId !== user.id)[0].userId);
    }

    const handleSendMessage = async () => {
        if (!isMsgSendReady || isMsgSending || messageToSend.trim().length === 0)
            return;

        if (!handler) {
            alert("Sorry, you are unable to send messages at this time.");
            return;
        }

        // Make sure other clients dont say we are still typing when a message is recevied
        uplink.cancelTypingNotification(convoId);

        setIsMsgSending(true);

        // Add local preview message
        const localMessage: MessageViewType = {
            sender: convertUserToPublicUserAccount(user),
            message: {
                id: "local-" + new Date().getTime(),
                plaintext: messageToSend,
                sentAt: new Date().getTime(),
                meta: { checksum: "" },
                channelId: convoId,
                senderId: user.id,
            }
        };
        setLocalMessages([...localMessages, localMessage]);

        const status = await handler.sendMessage(initialConvoData, messageToSend);

        if (!status) {
            alert("Sorry, we were unable to send your message.");
            // Remove local preview message if sending failed
            setLocalMessages(localMessages.filter(msg => msg.message.id !== localMessage.message.id));
        } else {
            // Update the local message with the server message
            refreshCb();
        }

        setMessageToSend("");
        setIsMsgSending(false);
        setIsMsgSendReady(false);
    };

    return (<>
        {!ready || !isInitialDataProcessed ? (
            <Center
                position="fixed"
                top="68px"
                left="0"
                height="calc(100% - 68px)"
                width="100%"
            >
                <Stack align="center" spacing="24px">
                    <Spinner size="xl" />
                </Stack>
            </Center>
        ) : (<>
            <Box
                width="52px"
                height="52px"
                background="#805fd3"
                bottom="120px"
                right="28px"
                position="fixed"
                borderRadius="50%"
                zIndex="999"
                boxShadow="0px 0px 18px rgba(0, 0, 0, 0.05)"
                onClick={() => {
                    scrollToBottom(false, true);
                }}
                transform={`scale(${scrollDownBtnVisible ? 1 : 0.4})`}
                opacity={scrollDownBtnVisible ? "1" : "0"}
                userSelect="none"
                pointerEvents={scrollDownBtnVisible ? "all" : "none"}
                transition=".15s"
            >
                <Center width="100%" height="100%">
                    <HStack gap="4px">
                        <FaChevronDown size={unreadMessagesCount > 0 ? "18px" : "24px"} />
                        {unreadMessagesCount && (
                            <Text textAlign="center" fontSize="16px">{unreadMessagesCount}</Text>
                        )}
                    </HStack>
                </Center>
            </Box>
            <Stack
                position="fixed"
                top="68px"
                left="0"
                height="calc(100% - 68px)"
                width="100%"
                gap="0"
                overflow="none"
            >
                <Box
                    height="100%"
                    width="100%"
                    overflowY={"auto"}
                    overflowX={"hidden"}
                    padding="16px"
                    className="hide-scrollbar"
                    onScroll={e => {
                        const el = (e.target as HTMLDivElement);

                        const scrollOffset = (el.scrollHeight - el.scrollTop - el.clientHeight);

                        // Reset unread message counter if we have scrolled back down
                        if (scrollOffset < 120)
                            setUnreadMessagesCount(0);

                        // Show the scroll down button if the have scrolled too far up
                        setScrollDownBtnVisible(scrollOffset > 120);
                    }}
                >
                    <style>{styles}</style>
                    {/* Message holder */}
                    <Box marginBottom="-100%">
                        {[...cachedMessages, ...localMessages].map((msg, index) => {
                            const isSender = msg.sender.id === user.id;
                            const prevMsg = (index == 0 ? undefined : [...cachedMessages, ...localMessages][index - 1]);
                            const prevTimeOffset = msg.message.sentAt - (prevMsg?.message.sentAt ?? msg.message.sentAt)
                            const msInWeek = 6048e5;

                            const currentDay = new Date().toLocaleDateString([], {
                                weekday: "long",
                            });
                            
                            const msgDay = new Date(msg.message.sentAt).toLocaleDateString([], {
                                weekday: "long",
                            });

                            const currDayNum = new Date().getDay();
                            const currMonthNum = new Date().getMonth();
                            const currYearNum = new Date().getFullYear();
                            const msgDayNum = new Date(msg.message.sentAt).getDay();
                            const msgMonthNum = new Date(msg.message.sentAt).getMonth();
                            const msgYearNum = new Date(msg.message.sentAt).getFullYear();

                            const isToday = (currDayNum == msgDayNum && currMonthNum == msgMonthNum && currYearNum == msgYearNum);

                            // * 0.8 so we show actual date a bit before a full week has passed
                            const isAWeekAgo = msg.message.sentAt < ((new Date().getTime() - msInWeek) * 0.8);

                            return (<>
                                {/* Indicate there has been a change in time to help maintain context of messages temporally */}
                                {/* Show this indicator if there is a time difference between messages of at least 1.5 hours */}
                                {prevTimeOffset > (1e3 * 60 * 60 * 1.5) && (
                                    <HStack gap="15px" opacity=".8" marginBottom="8px">
                                        <Box opacity=".8" width="100%" height="1px" background="accent.dark" />
                                        <HStack gap="5px">
                                            <Text fontWeight="bold" fontFamily="Inter" fontSize="16px" color="text.dark">
                                                {/* If same day, show "Today", else if ~a week ago show date, else show day string (ex. "Friday") */}
                                                {isToday ? "Today" : isAWeekAgo ? new Date(msg.message.sentAt).toLocaleDateString() : msgDay}
                                            </Text>
                                            <Text fontFamily="Inter" fontSize="16px" color="text.dark">
                                                {new Date(msg.message.sentAt).toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    hour12: false,
                                                })}
                                            </Text>
                                        </HStack>
                                        <Box opacity=".8" width="100%" height="1px" background="accent.dark" />
                                    </HStack>
                                )}
                                <Stack
                                    key={index}
                                    width="fit-content"
                                    maxWidth="80%"
                                    alignSelf={isSender ? "flex-end" : "flex-start"}
                                    background={isSender ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.05)"}
                                    borderRadius="lg"
                                    padding="8px 12px"
                                    marginBottom="8px"
                                    marginLeft={isSender ? "auto" : "0"}
                                    marginRight={isSender ? "0" : "auto"}
                                    opacity={localMessages.includes(msg) ? 0.5 : 1}
                                    position="relative"
                                >
                                    <Text
                                        fontSize="sm"
                                        fontWeight="bold"
                                        color={isSender ? "accent.dark" : "gray.300"}
                                    >
                                        {msg.sender.firstName} {msg.sender.lastName}
                                    </Text>
                                    <Text
                                        fontSize="md"
                                        color="text.dark"
                                    >
                                        {msg.message.plaintext}
                                    </Text>
                                    {localMessages.includes(msg) && <PulsingDot style={{ position: "absolute", right: "-12px", transition: "opacity 0.5s", opacity: 1 }} />}
                                </Stack>
                            </>);
                        })}
                    </Box>
                    <div ref={messagesEndRef} />
                </Box>
                <Stack
                    paddingLeft="16px"
                    paddingRight="16px"
                    paddingBottom="24px"
                    paddingTop="2px"
                >
                    <Box
                        height={typingUsers.length > 0 ? "15px" : "0px"}
                        opacity={typingUsers.length > 0 ? "1" : "0"}
                        transition=".2s"
                    >
                        <TypingIndicator users={typingUsers} />
                    </Box>
                    <HStack
                        height="52px"
                        width="100%"
                        gap="12px"
                    >
                        {/* Message input */}
                        <Input
                            placeholder="Type a message..."
                            value={messageToSend}
                            onChange={(e) => {
                                // Trim the start since we don't want to send messages with leading spaces
                                const value = e.target.value.trimStart();

                                setMessageToSend(value);
                                setIsMsgSendReady(value.trim().length > 0);

                                const now = Date.now();

                                if (value.trim().length > 0 && now - lastTypingNotification > 1000) {
                                    uplink.sendTypingNotification(convoId);
                                    setLastTypingNotification(now);
                                }
                            }}
                            disabled={!ready || isMsgSending || !handler}
                        />
                        <Box
                            width="24px"
                            height="24px"
                            onClick={handleSendMessage}
                        >
                            {isMsgSending ? (<>
                                <Spinner size="md" />
                            </>) : (<>
                                {/* Send button */}
                                <FaPaperPlane
                                    size="24px"
                                    opacity={isMsgSendReady ? "1" : "0.5"}
                                    style={{
                                        transition: ".2s",
                                    }}
                                />
                            </>)}
                        </Box>
                    </HStack>
                </Stack>
            </Stack>
        </>)}
    </>);
}