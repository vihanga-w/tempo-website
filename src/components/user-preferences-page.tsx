import {
    Box,
    Heading,
    Text,
    Switch,
    FormControl,
    FormLabel,
    VStack,
    Divider,
    Button,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
    Input,
    useDisclosure,
    HStack,
    Stack,
    Avatar,
    keyframes,
} from "@chakra-ui/react";
import { formatTimeToMinAndHour, SkeletonImage } from "@/components/playback-state";
import { useEffect, useState } from "react";
import { findBestSCDNImageSize } from "@/lib/utils";
import { getSizedImageUrl } from "@/lib/sized-img";
import User, { ClientUserAccount } from "@/lib/usrlib";
import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import { MdEdit } from "react-icons/md";
import { enablePushNotifications, getPushStatus, type PushStatus } from "@/lib/notify";

const ripple = keyframes`
    0% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 0.6;
    }
    70% {
        transform: translate(-50%, -50%) scale(2.5);
        opacity: 0;
    }
    100% {
        transform: translate(-50%, -50%) scale(2.5);
        opacity: 0;
    }
`;

function CustomSwitch({ isChecked, onChange, disabled }: { isChecked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, disabled?: boolean }) {
    return (
        <Switch
            colorScheme="accent.dark"
            sx={{
                ".chakra-switch__track": {
                    bg: "gray.700",
                    _checked: {
                        bg: "accent.dark",
                    },
                },
            }}
            disabled={disabled}
            isChecked={isChecked}
            onChange={onChange}
        />
    );
}

function Toggle({
    label,
    description,
    isChecked,
    onChange,
    disabled,
}: {
    label: string;
    description?: string;
    isChecked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
}) {
    return (
        <FormControl display="flex" alignItems="center" justifyContent="space-between" mb={description ? 1.5 : 0.5}>
            <Box>
                <Text fontWeight="medium">{label}</Text>
                {description && (
                    <Text fontSize="13px" color="gray.400" mt={-0.5}>
                        {description}
                    </Text>
                )}
            </Box>
            <CustomSwitch isChecked={isChecked} onChange={onChange} disabled={disabled} />
        </FormControl>
    );
}

export default function UserPreferencesPage({ user }: { user: User }) {
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [profileData, setProfileData] = useState<ClientUserAccount | undefined>(user.object);
    const [playbackState, setPlaybackState] = useState<UpdateEvent | null>(null);
    const [pfpLoadFailed, setPfpLoadFailed] = useState(false);
    const [streamer, setStreamer] = useState<DataStreamer | null>(null);
    const [streamerReset, setStreamerReset] = useState<boolean>(false);

    const [publicProfile, setPublicProfile] = useState(false);
    const [shareListeningActivity, setShareListeningActivity] = useState(user.settings.shareListeningActivity);
    const [friendSuggestions, setFriendSuggestions] = useState(false);
    const [friendRequestsNotifications, setFriendRequestsNotifications] = useState(false);
    const [dailyRecapNotifications, setDailyRecapNotifications] = useState(false);
    const [weeklyRecapNotifications, setWeeklyRecapNotifications] = useState(false);
    const [reactionNotifications, setReactionNotifications] = useState(false);

    const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
    const [enablingPush, setEnablingPush] = useState(false);
    const [pushMessage, setPushMessage] = useState<string>("");

    useEffect(() => {
        user.getRemoteUser(user.id)
        .then(r => {
            setProfileData(r);
        })
        .catch(e => {
            console.error("Failed to get remote user for", user.id, "error:", e);
        });
        
        user.loadSettings()
        .then(settings => {
            setShareListeningActivity(settings.shareListeningActivity);
        });

        const newStreamer = new DataStreamer(user.storedToken, [user.id]);
        setStreamer(newStreamer);

        newStreamer.on("update", (data: UpdateEvent) => {
            if (data.data.action.type === "STOPPED") setPlaybackState(null);
            else setPlaybackState(data);
        });

        newStreamer.on("remove", (userId) => {
            if (userId === user.id) setPlaybackState(null);
        });

        newStreamer.init();

        return () => {
            newStreamer.cleanup();
        };
    }, [user.isLoggedIn]);

    // Re-read on focus as well as on mount: undoing a block happens in the
    // browser's own settings, so the app finds out by being returned to, not by
    // anything it can observe itself.
    useEffect(() => {
        const readStatus = () => {
            getPushStatus()
                .then(setPushStatus)
                .catch(() => setPushStatus(null));
        };

        readStatus();

        window.addEventListener("focus", readStatus);
        document.addEventListener("visibilitychange", readStatus);

        return () => {
            window.removeEventListener("focus", readStatus);
            document.removeEventListener("visibilitychange", readStatus);
        };
    }, []);

    const onEnablePush = async () => {
        setPushMessage("");
        setEnablingPush(true);

        const result = await enablePushNotifications(user.id, user.getAuthHeaders());

        setPushStatus(await getPushStatus());
        setEnablingPush(false);

        if (result.ok) {
            setPushMessage("Notifications are on for this device.");

            return;
        }

        if (result.reason === "dismissed")
            setPushMessage("No answer given — you can try again whenever you like.");
        else if (result.reason === "failed")
            setPushMessage("Couldn't turn notifications on. Check your connection and try again.");
    };

    useEffect(() => {
        const handleFocus = async () => {
            if (streamer && !streamer.isReady()) {
                setPlaybackState(null);
                setStreamerReset(true);
            }
        };

        window.addEventListener("focus", handleFocus);
        return () => {
            window.removeEventListener("focus", handleFocus);
        };
    }, [streamer]);
    
    const _setInternalSettingState = (id: string, value: boolean) => {
        switch (id) {
            case "publicProfile":
                setPublicProfile(value);
                break;
            case "shareListeningActivity":
                setShareListeningActivity(value);
                break;
            case "friendSuggestions":
                setFriendSuggestions(value);
                break;
            case "friendRequestsNotifications":
                setFriendRequestsNotifications(value);
                break;
            case "dailyRecapNotifications":
                setDailyRecapNotifications(value);
                break;
            case "weeklyRecapNotifications":
                setWeeklyRecapNotifications(value);
                break;
            case "reactionNotifications":
                setReactionNotifications(value);
                break;
        }
    }

    const handleSettingChange = (id: string, value: boolean) => {
        console.log(`Setting changed: ${id} -> ${value}`);

        // Update UI instantly
        _setInternalSettingState(id, value);

        user.updateSetting(id, value)
        .then(success => {
            // Rollback change if not successful
            if (!success)
                setTimeout(() => { _setInternalSettingState(id, !value); }, 250);
        });
    };

    return (
        <Box w="100%" mx="auto" mt={2}>
            <VStack spacing={3} align="stretch">
                <Box mb={1}>
                    <HStack alignItems="space-between" justifyContent="space-between" mb={2}>
                        <Heading fontSize="26px" mb={1} textAlign="left">Account</Heading>
                        <Button
                            colorScheme="accent.dark"
                            variant="plain"
                            size="sm"
                            mt={1}
                            p={0}
                            onClick={() => alert("This feature is not yet implemented.")}
                        >
                            <Box mr={2}>
                                <MdEdit size="20px" />
                            </Box>
                            Edit Profile
                        </Button>
                    </HStack>

                    <HStack gap="14px">
                        <Box
                            width="88px"
                            height="88px"
                            border={playbackState ? "3px solid" : "0px"}
                            borderColor={playbackState ? "accent.dark" : "transparent"}
                            borderRadius="17px"
                            transition=".15s"
                        >
                            {((profileData?.images.length ?? 0) > 0 && !pfpLoadFailed) ? (
                                <SkeletonImage
                                    width={playbackState ? "82px" : "88px"}
                                    height={playbackState ? "82px" : "88px"}
                                    borderRadius="14px"
                                    transition=".15s"
                                    border={playbackState ? "2px solid transparent" : "0px"}
                                    src={getSizedImageUrl(findBestSCDNImageSize(profileData?.images ?? [], 88, 88) ?? "", 88, 88)}
                                    onError={() => setPfpLoadFailed(true)}
                                />
                            ) : (
                                <Avatar
                                    name={(profileData?.displayName ?? "") + (profileData?.id ?? "")}
                                    borderRadius="14px"
                                    transition=".15s"
                                    border={playbackState ? "2px solid transparent" : "0px"}
                                    width={playbackState ? "82px" : "88px"}
                                    height={playbackState ? "82px" : "88px"}
                                />
                            )}
                        </Box>

                        <Stack gap="0" marginTop="-5px">
                            <Text fontFamily="Inter" fontWeight="medium" fontSize="28px" color="text.dark" opacity="0.9">
                                {profileData?.displayName}
                            </Text>
                            <Text fontFamily="Inter" fontWeight="regular" fontSize="14px" color="text.dark" opacity="0.75" marginTop="-4px">
                                {profileData?.listenerTypeClassification ?? "Casual Listener"}
                            </Text>

                            {(playbackState?.data.state?.playSessionStart &&
                                new Date().getTime() - playbackState.data.state.playSessionStart >= 5 * 60e3) ? (
                                <Text>🔥 {formatTimeToMinAndHour(new Date().getTime() - playbackState.data.state.playSessionStart, true)}</Text>
                            ) : playbackState ? (
                                <Text>Started listening recently</Text>
                            ) : (
                                <Text>No active streak</Text>
                            )}
                        </Stack>
                    </HStack>
                </Box>

                <Divider />

                <VStack alignItems="flex-start" gap="0px">
                    <Heading fontSize="26px" mb={1} textAlign="left">Privacy</Heading>
                    <Text fontSize="15px" lineHeight="18px" mb={4}>
                        Manage your privacy settings and control who can see your activity.
                    </Text>
                    {/* TODO: Only allow public profiles to users age >= 16 */}
                    <Toggle
                        label="Public Profile"
                        description="Allow anyone to view your full profile"
                        isChecked={publicProfile}
                        onChange={(e) => handleSettingChange("publicProfile", e.target.checked)}
                        disabled
                    />
                    <Toggle
                        label="Share Listening Activity"
                        description="Share real-time listening activity with friends"
                        isChecked={shareListeningActivity}
                        onChange={(e) => handleSettingChange("shareListeningActivity", e.target.checked)}
                    />
                    <Toggle
                        label="Allow Friend Suggestions"
                        description="Recommend profile to people you may know"
                        isChecked={friendSuggestions}
                        onChange={(e) => handleSettingChange("friendSuggestions", e.target.checked)}
                        disabled
                    />
                </VStack>

                <Divider />

                <Box>
                    <Heading fontSize="26px" mb={1} textAlign="left">Notifications</Heading>
                    <Text fontSize="15px" lineHeight="18px" mb={4}>
                        Disable specific notifications to reduce distractions.
                    </Text>

                    {pushStatus !== null && pushStatus !== "on" && (
                        <Box
                            border="1px solid #262626"
                            borderRadius="12px"
                            p="4"
                            mb="5"
                            bg="#131313"
                        >
                            <Text fontSize="15px" fontWeight="semibold" color="#f5f5f5" mb="1">
                                {pushStatus === "unsupported"
                                    ? "Notifications aren't available here"
                                    : "Notifications are off"}
                            </Text>

                            <Text fontSize="14px" color="#a0a0a0" lineHeight="1.6" mb={pushStatus === "off" ? 4 : 0}>
                                {pushStatus === "denied" ? (
                                    <>
                                        Your browser is blocking notifications from Tempo, and only you
                                        can undo that. Open the padlock or site settings next to the
                                        address bar, set Notifications to Allow, then come back — on
                                        iPhone, Tempo also has to be added to your Home Screen.
                                    </>
                                ) : pushStatus === "unsupported" ? (
                                    <>
                                        This browser can&apos;t receive push notifications. On iPhone,
                                        add Tempo to your Home Screen and open it from there.
                                    </>
                                ) : (
                                    <>
                                        You won&apos;t hear when a friend lands on the same song as you,
                                        reacts to what you&apos;re playing, or when a recap is ready.
                                    </>
                                )}
                            </Text>

                            {pushStatus === "off" && (
                                <Button
                                    onClick={onEnablePush}
                                    isLoading={enablingPush}
                                    size="sm"
                                    bg="#1f1f1f"
                                    color="#f5f5f5"
                                    borderRadius="10px"
                                    _hover={{ bg: "#272727" }}
                                    _active={{ bg: "#2f2f2f" }}
                                >
                                    Turn on notifications
                                </Button>
                            )}

                            {pushMessage !== "" && (
                                <Text fontSize="13px" color="#a0a0a0" mt="3" lineHeight="1.5">
                                    {pushMessage}
                                </Text>
                            )}
                        </Box>
                    )}

                    {pushStatus === "on" && pushMessage !== "" && (
                        <Text fontSize="14px" color="#8fdc9b" mb="5" lineHeight="1.5">
                            {pushMessage}
                        </Text>
                    )}

                    <Toggle
                        label="Friend Requests"
                        description="Be notified of new friend requests"
                        isChecked={friendRequestsNotifications}
                        onChange={(e) => handleSettingChange("friendRequestsNotifications", e.target.checked)}
                        disabled
                    />
                    <Toggle
                        label="Daily Recaps"
                        description="Be notified when your daily recap is ready"
                        isChecked={dailyRecapNotifications}
                        onChange={(e) => handleSettingChange("dailyRecapNotifications", e.target.checked)}
                        disabled
                    />
                    <Toggle
                        label="Weekly Recaps"
                        description="Be notified when your weekly recap is ready"
                        isChecked={weeklyRecapNotifications}
                        onChange={(e) => handleSettingChange("weeklyRecapNotifications", e.target.checked)}
                        disabled
                    />
                    <Toggle
                        label="Reactions"
                        description="Be notified when friends react to your activity"
                        isChecked={reactionNotifications}
                        onChange={(e) => handleSettingChange("reactionNotifications", e.target.checked)}
                        disabled
                    />
                </Box>

                <Divider />

                <VStack alignItems="flex-start" gap="0px">
                    <HStack spacing="8px" alignItems="center" mb={2}>
                        <Heading fontSize="26px" textAlign="left">Spotify</Heading>
                        <Box position="relative" width="14px" height="14px" mt={1} ml={0.5} opacity={0.85}>
                            <Box
                                width="10px"
                                height="10px"
                                bg="green.400"
                                borderRadius="full"
                                position="absolute"
                                top="50%"
                                left="50%"
                                transform="translate(-50%, -50%)"
                                zIndex="2"
                            />
                            <Box
                                width="10px"
                                height="10px"
                                border="2px solid"
                                borderColor="green.300"
                                borderRadius="full"
                                position="absolute"
                                top="50%"
                                left="50%"
                                transform="translate(-50%, -50%)"
                                animation={`${ripple} 2s infinite`}
                                zIndex="1"
                            />
                            <Box
                                width="10px"
                                height="10px"
                                border="2px solid"
                                borderColor="green.300"
                                borderRadius="full"
                                position="absolute"
                                top="50%"
                                left="50%"
                                transform="translate(-50%, -50%)"
                                animation={`${ripple} 2s infinite`}
                                style={{ animationDelay: "0.4s" }}
                                zIndex="0"
                            />
                        </Box>
                    </HStack>
                    <Text fontSize="sm" mb={3.5} color="gray.400">
                        Your Spotify account is connected!<br /><br />
                        Experiencing issues?<br />
                        Try reconnecting your Spotify account.
                    </Text>
                    <Button colorScheme="accent.dark" variant="outline" size="sm" onClick={async () => {
                        if (confirm("Are you sure you want to reconnect your Spotify account?\n\nThis will reset your application state.")) {
                            try { await user.logout(); } catch (e) { console.error("Failed to logout", e); }

                            window.localStorage.removeItem("tempo-dev-warning-msg");
                            window.localStorage.removeItem("tempo-initial-visit");
                            window.localStorage.removeItem("tempo-legal-agreed");
                            window.localStorage.removeItem("tempo-local-version");
                            window.localStorage.removeItem("tempo-local-version-notice");
                            window.localStorage.removeItem("tempo-navigation");
                            window.localStorage.removeItem("tempo-notif-processed");
                            window.localStorage.removeItem("tempo-override-pwa-detection");
                            window.localStorage.removeItem("tempo.a");

                            if ('serviceWorker' in navigator) {
                                try {
                                    const registration = await navigator.serviceWorker.ready;
                                    const subscription = await registration.pushManager.getSubscription();
                                    if (subscription) {
                                        await subscription.unsubscribe();
                                        console.log('Push subscription removed successfully.');
                                    } else {
                                        console.log('No push subscription found.');
                                    }
                                } catch (error) {
                                    console.error('Failed to remove push subscription:', error);
                                }
                            } else {
                                console.warn('Service Worker is not supported in this browser.');
                            }

                            window.location.href = "/reauth";
                        }
                    }}>
                        Reconnect Spotify
                    </Button>
                </VStack>

                <Divider />

                <Box
                    p={3}
                    borderRadius="12px"
                    backgroundColor="rgba(255, 0, 0, 0.08)"
                    mt={1}
                >
                    <Heading fontSize="22px" mb={1} color="red.300" textAlign="left">
                        Danger Zone
                    </Heading>
                    <Text fontSize="sm" mb={3} color="red.200">
                        Actions in this section are irreversible and may result in data loss.
                        <br /><br />
                        We cannot recover your data if you continue.
                        <br /><br />
                        Please proceed with caution.
                    </Text>
                    <Button colorScheme="red" variant="solid" size="sm" width="100%" mb={2} onClick={() => {
                        if (confirm(
                            "Are you sure you want to disconnect your Spotify account?\n\n" +
                            "All data associated with you and Tempo. will be removed.\n\n" +
                            "This action is irreversible and cannot be undone.\n\n" +
                            "This will not affect your Spotify account."
                        )) {
                            alert("This feature is not yet implemented.");
                        }
                    }}>
                        Disconnect Spotify
                    </Button>
                </Box>

                <Modal isOpen={isOpen} onClose={onClose} isCentered>
                    <ModalOverlay />
                    <ModalContent bg="gray.800">
                        <ModalHeader>Edit Profile</ModalHeader>
                        <ModalCloseButton />
                        <ModalBody>
                            <VStack spacing={4} align="stretch">
                                <FormControl>
                                    <FormLabel>Username</FormLabel>
                                    <Input placeholder="Enter your username" bg="gray.700" borderColor="gray.600" />
                                </FormControl>
                                <FormControl>
                                    <FormLabel>Bio</FormLabel>
                                    <Input placeholder="Write a short bio" bg="gray.700" borderColor="gray.600" />
                                </FormControl>
                                <FormControl>
                                    <FormLabel>Profile Picture URL</FormLabel>
                                    <Input placeholder="Paste image URL" bg="gray.700" borderColor="gray.600" />
                                </FormControl>
                            </VStack>
                        </ModalBody>
                        <ModalFooter>
                            <Button colorScheme="accent.dark" mr={3}>
                                Save Changes
                            </Button>
                            <Button onClick={onClose} variant="ghost">
                                Cancel
                            </Button>
                        </ModalFooter>
                    </ModalContent>
                </Modal>
            </VStack>
        </Box>
    );
}