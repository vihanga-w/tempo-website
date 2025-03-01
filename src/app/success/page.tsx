"use client";

import { Loader } from "@/components/loader";
import { useEffect } from "react";

export default function AuthSuccess() {
    useEffect(() => {
        if (!document || !window)
            return;

        if (!document.cookie.includes("tempo.a="))
            window.location.pathname = "/error";

        setTimeout(() => {
            window.location.pathname = "/";
        }, 250);
    }, []);

    return (<Loader />)
}