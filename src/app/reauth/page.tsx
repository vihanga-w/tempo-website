"use client";

import { useEffect } from "react";
import { Box, Spinner, Center } from "@chakra-ui/react";
import FullLoader from "@/components/full-loader";

export default function LogoutPage() {
    useEffect(() => {
        const timeout = setTimeout(() => {
            window.location.href = "https://api.tempo-music.co/auth/ui";
        }, 1e3);

        return () => clearTimeout(timeout);
    }, []);

    return (
        <FullLoader />
    );
}