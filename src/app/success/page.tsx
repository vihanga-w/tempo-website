"use client";

import { Loader } from "@/components/loader";
import { use, useEffect, useState } from "react";

import Lanyard from "@/components/Lanyard/Lanyard";
import { Box } from "@chakra-ui/react";
import ScrollVelocity from "@/TextAnimations/ScrollVelocity/ScrollVelocity";

export default function AuthSuccess() {
    const [invertGravity, setInvertGravity] = useState(false);

    useEffect(() => {
        if (!document || !window)
            return;

        // TODO: Verify the user's token

        setTimeout(() => {
            setInvertGravity(true);
        }, 3200);
    }, []);

    // useEffect(() => {
    //     if (!document || !window)
    //         return;

    //     if (!document.cookie.includes("tempo.a="))
    //         window.location.pathname = "/error";

    //     const authToken = document.cookie.split("tempo.a=")[1].split(";")[0];

    //     window.localStorage.setItem("tempo.a", authToken);

    //     setTimeout(() => {
    //         window.location.pathname = "/";
    //     }, 250);
    // }, []);

    // return (<Loader />)

    return (
        <Box pointerEvents="none">
            <Box pos="fixed" top="-100px" left="-25px" zIndex="0" transform="rotate(-10deg)" opacity=".45">
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
            <Box pos="fixed" bottom="205px" left="-25px" zIndex="0" transform="rotate(-10deg)" opacity=".45">
                <ScrollVelocity
                    texts={['TEMPO MUSIC', 'TEMPO MUSIC']} 
                    velocity={40}
                    numCopies={10} 
                    className="custom-scroll-text"
                />
            </Box>
        </Box>
    );
}