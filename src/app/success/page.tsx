"use client";

import { Loader } from "@/components/loader";
import { useEffect } from "react";

export default function AuthSuccess() {
    useEffect(() => {
        if (!document || !window)
            return;

        if (!document.cookie.includes("tempo.a="))
            window.location.pathname = "/error";

        const authToken = document.cookie.split("tempo.a=")[1].split(";")[0];

        window.localStorage.setItem("tempo.a", authToken);

        setTimeout(() => {
            window.location.pathname = "/";
        }, 250);
    }, []);

    return (<Loader />)
}