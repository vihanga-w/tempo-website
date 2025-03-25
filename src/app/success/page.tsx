"use client";

import { Loader } from "@/components/loader";
import { use, useEffect, useState } from "react";

import Lanyard from "@/components/Lanyard/Lanyard";
import { Box } from "@chakra-ui/react";

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
            <Lanyard position={[0, 0, 16]} gravity={[0, -40 * (invertGravity ? -1.75 : 1), 0]} />
        </Box>
    );
}