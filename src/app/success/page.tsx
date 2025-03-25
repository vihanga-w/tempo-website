"use client";

import { Loader } from "@/components/loader";
import { use, useEffect, useState } from "react";

import Lanyard from "@/components/Lanyard/Lanyard";
import { Box, Center } from "@chakra-ui/react";
import ScrollVelocity from "@/TextAnimations/ScrollVelocity/ScrollVelocity";
import SplitText from "@/TextAnimations/SplitText/SplitText";
import { API_URL } from "@/lib/const";
import { ClientUserAccount } from "@/lib/usrlib";

function ensureReady() {
    let ready = false;
    let cb: (() => void) | undefined;

    return {
        ready: () => {
            if (cb)
                cb();

            ready = true;
        },
        wait: () => {
            return new Promise<void>((resolve) => {
                if (ready)
                    return resolve();

                cb = resolve;
            });
        }
    }
}

export default function AuthSuccess() {
    const [invertGravity, setInvertGravity] = useState(false);
    const [showWelcomeText, setShowWelcomeText] = useState(false);
    const [showWelcomeText2, setShowWelcomeText2] = useState(false);
    const [username, setUsername] = useState<{
        cb: () => void;
        text: string;
    } | undefined>();

    useEffect(() => {
        if (!document || !window)
            return;

        const er = ensureReady();

        setTimeout(async () => {
            await er.wait();

            setInvertGravity(true);

            setTimeout(() => {
                setShowWelcomeText(true);
            }, 250);
            setTimeout(() => {
                setShowWelcomeText2(true);
            }, 3200);
        }, 3200);

        if (!document.cookie.includes("tempo.a="))
            window.location.pathname = "/error";

        const authToken = document.cookie.split("tempo.a=")[1].split(";")[0];

        window.localStorage.setItem("tempo.a", authToken);

        const headers = {
            "x-api-token": authToken
        }

        fetch(API_URL + "/me", {
            headers,
            credentials: "include"
        }).then(async req => {;
            const res = await req.json() as {
                error: boolean;
                data?: ClientUserAccount;
                message?: string;
            }

            if (res.error) {
                // The server has stated that there was an error
                console.warn("Server responded with an error state while fetching user authentication status, error:", res.message ?? "Unspecified server error");

                window.location.pathname = "/error";

                return;
            }

            setUsername({
                cb: er.ready,
                text: res.data?.displayName ?? "User"
            });
        });
    }, []);

    useEffect(() => {
        if (!username)
            return;

        username.cb();
    }, [username]);

    return (
        <Box pointerEvents="none">
            <Box pos="fixed" top="-100px" left="-25px" zIndex="1" transform="rotate(-10deg)" opacity=".45">
                <ScrollVelocity
                    texts={['WELCOME', 'WELCOME']} 
                    velocity={40}
                    numCopies={10} 
                    className="custom-scroll-text"
                />
            </Box>
            <Box pos="relative" zIndex="10">
                <Lanyard position={[0, 0, 14]} gravity={[0, -40 * (invertGravity ? -1.75 : 1), 0]} transparent />
            </Box>
            <Box pos="fixed" bottom="205px" left="-25px" zIndex="1" transform="rotate(-10deg)" opacity=".45">
                <ScrollVelocity
                    texts={['TEMPO MUSIC', 'TEMPO MUSIC']} 
                    velocity={40}
                    numCopies={10} 
                    className="custom-scroll-text"
                />
            </Box>
            <Center h="100vh" w="100vw" pos="fixed" zIndex="1" top="0">
                <Box w="75vw" textAlign="center" fontSize="20px" fontWeight="medium" fontFamily="Inter">
                    {showWelcomeText && (<>
                        <SplitText
                            text={`Welcome to Tempo${username && username.text !== "" ? ", " + username.text : ""}.`}
                            className="text-2xl font-semibold text-center"
                            delay={65}
                            animationFrom={{ opacity: 0, transform: 'translate3d(0,12px,0)', filter: 'blur(4px)' }}
                            animationTo={{ opacity: 1, transform: 'translate3d(0,0,0)', filter: 'blur(0px)' }}
                            //   easing="easeOutCubic"
                            threshold={0.2}
                            rootMargin="-50px"
                            onLetterAnimationComplete={() => {
                                // alert();
                            }}
                        />
                        <SplitText
                            // Invisible character to stop text from being displayed since first character is shown
                            text={`‎We're glad to have you here!`}
                            className="text-2xl font-semibold text-center"
                            delay={showWelcomeText2 ? 65 : 9e90}
                            animationFrom={{ opacity: 0, transform: 'translate3d(0,12px,0)', filter: 'blur(4px)' }}
                            animationTo={{ opacity: 1, transform: 'translate3d(0,0,0)', filter: 'blur(0px)' }}
                            //   easing="easeOutCubic"
                            threshold={0.2}
                            rootMargin="-50px"
                            onLetterAnimationComplete={() => {
                                setTimeout(() => {
                                    window.location.pathname = "/";
                                }, 1750);
                            }}
                        />
                    </>)}
                </Box>
            </Center>
        </Box>
    );
}