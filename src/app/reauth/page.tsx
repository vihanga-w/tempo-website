"use client";

import { useEffect } from "react";
import { Box, Spinner, Center } from "@chakra-ui/react";
import FullLoader from "@/components/full-loader";
import { API_URL } from "@/lib/const";

export default function LogoutPage() {
    useEffect(() => {
        const timeout = setTimeout(() => {
            // Was hardcoded to api.tempo-music.co, which has been retired - so this
            // page has been sending anybody who needs to sign in again to a host
            // that no longer resolves.
            window.location.href = API_URL + "/auth/ui";
        }, 1e3);

        return () => clearTimeout(timeout);
    }, []);

    return (
        <FullLoader />
    );
}