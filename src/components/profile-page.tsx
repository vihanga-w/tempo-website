import { DataStreamer, UpdateEvent } from "@/lib/live-ingest";
import User from "@/lib/usrlib";
import { HStack, Stack, Box, Image, Text, Avatar } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import ReactTimeAgo from "react-time-ago";
import { PlaybackState } from "./playback-state";
import { FastAverageColor } from 'fast-average-color';
import { apcach, crToBg } from "apcach";
import { oklch, formatHex } from 'culori';

export default function ProfilePage({
    user,
    pageChanger,
    admin,
    hideTopGradientCb,
    setComplementaryColour,
}: Readonly<{
    user: User;
    pageChanger: (id: string, prevPage?: string) => void;
    admin?: boolean;
    hideTopGradientCb: (hide: boolean) => void;
    setComplementaryColour: (hex: string) => void;
}>) {
    const [pfpLoadFailed, setPfpLoadFailed] = useState(false);
    const [playbackStateLoading, setPlaybackStateLoading] = useState(true);
    const [streamer, setStreamer] = useState<DataStreamer | null>(null);
    const [streamerReset, setStreamerReset] = useState<boolean>(false);
    const [playbackState, setPlaybackState] = useState<UpdateEvent | null>(null);
    const [reactiveDesignColour, setReactiveDesignColour] = useState<string | null>(null);
    const [reactiveDesignColourCommited, setReactiveDesignColourCommited] = useState<string | null>(null);
    const [displayReactiveDesignColour, setDisplayReactiveDesignColour] = useState<boolean>(false);
    const [reactiveDesignComplementaryColour, setReactiveDesignComplementaryColour] = useState<string | null>(null);

    const lastActive = new Date().getTime();

    const setStatusBarColour = (colour: string) => {
        const themeColour = document.querySelector("meta[name=theme-color]");
        themeColour?.setAttribute("content", colour);
    }

    useEffect(() => {
        const newStreamer = new DataStreamer(user.storedToken, [user.id]);
        
        setStreamer(newStreamer);

        newStreamer.on("update", (data: UpdateEvent) => {
            setPlaybackStateLoading(false);

            setPlaybackState((v) => {
                if (data.data.state) {
                    const fac = new FastAverageColor();
                    
                    fac.getColorAsync(data.data.state.imageUrl)
                    .then(color => {
                        setReactiveDesignColour(color.rgb);
                        hideTopGradientCb(true);
                        // container.style.backgroundColor = color.rgba;
                        // container.style.color = color.isDark ? '#fff' : '#000';
                    })
                    .catch(e => {
                        console.log(e);
                    });
                }

                if (v && data.data.action.type == "STOPPED") {
                    setReactiveDesignColour(null);

                    return null;
                } else if (!v && data.data.action.type !== "STOPPED") {
                    return data;
                }
                
                return v;
            });
        });

        newStreamer.on("remove", (userId) => {
            if (userId === user.id) {
                setPlaybackState(null);
                setReactiveDesignColour(null);
            }
        });

        newStreamer.on("close", () => {
            // no-op, state will update once connection re-established
        });

        newStreamer.init();

        return () => {
            newStreamer.cleanup();
        };
    }, [user.isLoggedIn]);

    useEffect(() => {
        if (reactiveDesignColour) {
            setDisplayReactiveDesignColour(false);

            setTimeout(() => {
                setReactiveDesignColourCommited(reactiveDesignColour);
            }, 230);
            setTimeout(() => {
                setDisplayReactiveDesignColour(true);
            }, 250);
        } else {
            setReactiveDesignColourCommited(reactiveDesignColour);
            setTimeout(() => {
                setDisplayReactiveDesignColour(true);
            }, 20);
        }
    }, [reactiveDesignColour]);

    useEffect(() => {
        hideTopGradientCb(reactiveDesignColour !== null);
    }, [reactiveDesignColour]);

    useEffect(() => {
        setStatusBarColour(reactiveDesignColourCommited ?? "#0d0d0e");
    }, [reactiveDesignColourCommited]);

    useEffect(() => {
        const handleFocus = async () => {
            if (streamer && !streamer.isReady()) {
                setPlaybackStateLoading(true);
                setPlaybackState(null);
                setStreamerReset(true);
            }
        };

        window.addEventListener("focus", handleFocus);
        return () => {
            window.removeEventListener("focus", handleFocus);
        };
    }, [streamer]);
    
    useEffect(() => {
        if (streamerReset && streamer && playbackState) {
            streamer.cleanup();
            streamer.init();
            setStreamerReset(false);
        }
    }, [playbackState, streamer, streamerReset]);

    function componentToHex(c: number) {
        var hex = Math.ceil(Math.min(c, 255)).toString(16);

        return hex.length == 1 ? "0" + hex : hex;
    }
    
    function rgbToHex(r: number, g: number, b: number) {
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }

    function hexToRgb(hex: string) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    useEffect(() => {
        if (reactiveDesignColourCommited) {
            // Convert "rgb(r, g, b)" to an array of numbers [r, g, b]
            const rgbValues = reactiveDesignColourCommited
                .match(/\d+/g)
                ?.map(Number);

            if (rgbValues && rgbValues.length === 3) {
                const [r, g, b] = rgbValues;
                let hex = rgbToHex(r, g, b);

                console.log("rgb:", r, g, b);
                console.log("hex:", hex);

                // Check if the color is a shade of white (r, g, b values close to each other and above 100)
                const isShadeOfWhite = Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15 && r > 100 && g > 100 && b > 100;
                
                if (isShadeOfWhite) {
                    setReactiveDesignComplementaryColour("#ffffff");
                    setComplementaryColour("#ffffff");

                    return;
                }

                let colourMultiplier = 1;

                if (r > 175 && g > 175 && b > 175) {
                    colourMultiplier = 2.75;
                } else if (r < 80 && g < 80 && b < 80) {
                    colourMultiplier = 1.25;
                }

                // If rgb value is far from white, make it closer to white
                // const adjustedRgb = {
                //     r: Math.min(255, r + 30),
                //     g: Math.min(255, g + 30),
                //     b: Math.min(255, b + 30),
                // };
                // const adjustedHex = rgbToHex(adjustedRgb.r, adjustedRgb.g, adjustedRgb.b);
                // console.log("adjusted rgb:", adjustedRgb);
                // console.log("adjusted hex:", adjustedHex);

                // if (adjustedHex !== hex)
                //     hex = adjustedHex;

                const h = oklch(hex);

                console.log("chroma:", h?.c);
                console.log("hue:", h?.h);

                const ideal = apcach(crToBg(hex, 60), h?.c ?? 0, h?.h ?? 0);
                console.log("l:", ideal.lightness)
                const idealHexPre = formatHex(oklch({
                    mode: "oklch",
                    l: Math.max(ideal.lightness, 0.85),
                    c: ideal.chroma,
                    h: ideal.hue,
                    // alpha: ideal.alpha
                }));
                const idealRgb = hexToRgb(idealHexPre);
                console.log("ideal pre:",idealHexPre, idealRgb);
                const idealHex = rgbToHex((idealRgb?.r ?? 0) * colourMultiplier, (idealRgb?.g ?? 0) * colourMultiplier, (idealRgb?.b ?? 0) * colourMultiplier);
                
                console.log("ideal:",idealHex);
                
                setReactiveDesignComplementaryColour(idealHex);
                setComplementaryColour(idealHex);
            }
        } else {
            setReactiveDesignComplementaryColour("#ffffff");
            setComplementaryColour("#ffffff");
        }
    }, [reactiveDesignColourCommited]);

    return (<>
        <Box
            pos="fixed"
            left="0"
            top="0"
            zIndex="0"
            background={`linear-gradient(to bottom, ${reactiveDesignColourCommited ?? "#ffffff00"}, #ffffff00)`}
            opacity={displayReactiveDesignColour ? "0.65" : 0}
            transform={displayReactiveDesignColour ? "translateY(-60px)" : "translateY(-100%)"}
            padding="24px"
            width="100vw"
            height="400px"
            transition=".75s"
        />
        <Box
            pos="fixed"
            left="0"
            top="0"
            zIndex="0"
            background={reactiveDesignColourCommited ?? "#ffffff00"}
            opacity={displayReactiveDesignColour ? "0.15" : 0}
            padding="24px"
            width="100vw"
            height="100vh"
            transition=".75s"
        />
        <Stack gap="26px" width="100%" pos="relative" zIndex="1" marginTop="-15px">
            <HStack gap="24px" marginTop="24px">
                {((user?.object?.images.length ?? 0) > 0 && !pfpLoadFailed) ? (
                    <Image
                        width="82px"
                        height="82px"
                        objectFit="cover"
                        borderRadius="12px"
                        // We are using the first image for now, need to write a method to use most optimal image
                        src={user?.object?.images[0]?.url}
                        draggable={false}
                        onError={() => {
                            setPfpLoadFailed(true);
                        }}
                    />
                ) : (
                    <Avatar
                        // Append user id so that different users potentially with same name has different bg colours
                        name={user.object?.displayName ?? "" + user.object?.id ?? ""}
                        borderRadius="12px"
                        width="82px"
                        height="82px"
                    />
                )}
                <Stack gap="0" marginTop="-5px">
                    <Text
                    fontFamily="Inter"
                        fontWeight="medium"
                        fontSize="28px"
                        color="text.dark"
                        opacity="0.9"
                        onClick={() => {
                            pageChanger("edit-profile", "settings");
                        }}
                    >
                    {user.object?.displayName}
                    </Text>
                    <Text
                        fontFamily="Inter"
                        fontWeight="regular"
                        fontSize="14px"
                        color="text.dark"
                        opacity="0.75"
                        marginTop="-4px"
                        onClick={() => {
                            pageChanger("edit-profile", "settings");
                        }}
                    >
                    Last active{" "}
                    {new Date().getTime() - lastActive <= 3600e3 * 12 ? (
                        <ReactTimeAgo date={lastActive} locale="en-GB" />
                    ) : (
                        new Date(lastActive).toLocaleDateString("en-GB")
                    )}
                    </Text>
                    <Text
                        fontFamily="Inter"
                        fontWeight="regular"
                        fontSize="14px"
                        color="skyblue"
                        opacity="0.75"
                        onClick={() => {
                            window.location.pathname = "/success";
                        }}
                    >
                    Play with Card
                    </Text>
                </Stack>
            </HStack>
            <Stack gap="1px" opacity={playbackState ? "1" : "0"} height={playbackState ? "auto" : "0"} overflow="hidden" transition=".5s">
                <Text
                    fontFamily="Inter"
                    fontWeight="bold"
                    fontSize="24px"
                    color={reactiveDesignComplementaryColour ?? "text.dark"}
                    transition=".3s"
                >Listening to</Text>
                <PlaybackState
                    stream={streamer}
                    userId={user.id}
                    hideProfile
                />
            </Stack>
        </Stack>
        </>);
}