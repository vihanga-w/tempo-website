"use client";

import { API_URL } from "@/lib/const";
import { Box, Heading, Text, Button } from "@chakra-ui/react";
import { useEffect } from "react";

export default function AuthSuccess() {
    useEffect(() => {
        if (!window.location)
            return;

        const swapToken = window.location.search.split("st=")[1].split("&")[0];

        fetch(API_URL + "/appauth/complete/" + swapToken)
    }, []);

    return (<Box background="#0D0D0E" width="100vw" height="100vh" />);
}