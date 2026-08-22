"use client";

import { Loader } from "@/components/loader";
import { use, useEffect, useState } from "react";

import Lanyard from "@/components/Lanyard/Lanyard";
import { Box, Center } from "@chakra-ui/react";
import ScrollVelocity from "@/TextAnimations/ScrollVelocity/ScrollVelocity";
import SplitText from "@/TextAnimations/SplitText/SplitText";
import { API_URL } from "@/lib/const";
import { ClientUserAccount } from "@/lib/usrlib";

function ensureReady(readyCount = 1) {
    let ready = 0;
    let readyIds: string[] = [""];
    let cb: (() => void) | undefined;

    return {
        ready: (readyId: string) => {
            if (readyIds.includes(readyId))
                return;

            ready++;
            readyIds.push(readyId);

            if (cb && ready >= readyCount)
                cb();

            console.log("ER-Ready:", ready, "/", readyCount);
        },
        wait: () => {
            return new Promise<void>((resolve) => {
                console.log("ER-Waiting:", ready, "/", readyCount);
                
                if (ready >= readyCount) {
                    console.log("ER-Resolved");
                    return resolve();
                }

                cb = resolve;
            });
        }
    }
}

export default function AuthSuccess() {
    const [invertGravity, setInvertGravity] = useState(false);
    const [showWelcomeText, setShowWelcomeText] = useState(false);
    const [showWelcomeText2, setShowWelcomeText2] = useState(false);
    const [er, _] = useState(ensureReady(2));
    const [display, setDisplay] = useState(false);
    const [username, setUsername] = useState<string | undefined>();

    const isDev = false;

    useEffect(() => {
        if (!document || !window)
            return;

        // Read and persist the auth token before anything can redirect away.
        //
        // The returning-user redirect below used to run first, so an existing
        // user was sent to the app without the token ever reaching localStorage.
        // The app then had no credential to send, bounced back into the auth
        // flow, and landed here again — an endless / -> /success -> / loop.
        const authToken = (document.cookie.includes("tempo.a=") ? document.cookie.split("tempo.a=")[1].split(";")[0] : "");

        if (authToken)
            window.localStorage.setItem("tempo.a", authToken);

        // If this is not a new install, redirect stright to application
        if (localStorage.getItem("tempo-legal-agreed")) {
            window.location.pathname = "/";
            return;
        }

        setDisplay(true);

        er.wait().then(() => {
            setInvertGravity(true);

            setTimeout(() => {
                setShowWelcomeText(true);
            }, 250);
            setTimeout(() => {
                setShowWelcomeText2(true);
            }, 3200);
        });

        if (!authToken && !isDev)
            window.location.pathname = "/error";

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

                if (!isDev)
                    window.location.pathname = "/error";

                return;
            }

            setUsername(res.data?.displayName ?? "User");
        });

        const handleFocus = async () => {
            // In case the user swipes backwards by accident just after authorising
            if (localStorage.getItem("tempo-legal-agreed"))
                window.location.pathname = "/";
        };

        window.addEventListener("focus", handleFocus);

        return () => {
            window.removeEventListener("focus", handleFocus);
        };
    }, []);

    useEffect(() => {
        if (!username)
            return;

        console.log(username)

        er.ready("username");
    }, [username]);

    return (
        <Box pointerEvents="none" opacity={display ? 1 : 0}>
            <Box pos="fixed" top="-100px" left="-25px" zIndex="1" transform="rotate(-10deg)" opacity=".45">
                <ScrollVelocity
                    texts={['WELCOME', 'WELCOME']} 
                    velocity={40}
                    numCopies={10} 
                    className="custom-scroll-text"
                />
            </Box>
            <Box pos="relative" zIndex="10">
                <Lanyard onRest={() => {
                    er.ready("physics-rest");
                }} position={[0, 0, 14]} gravity={[0, -40 * (invertGravity ? -1.45 : 1), 0]} transparent />
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
                            text={`Welcome to Tempo${username && username !== "" ? ", " + username : ""}.`}
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
                                    if (!isDev)
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