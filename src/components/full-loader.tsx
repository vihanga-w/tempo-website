"use client";

import { Text, Center } from "@chakra-ui/react";
import { useEffect, useState } from "react";

export default function FullLoader() {
    const [fontIndex, setFontIndex] = useState<number>(0);

    const fontLoop: {
        family: string;
        weight: string;
        size: string;
    }[] = [
        {
            family: "Nanum Pen Script",
            weight: "regular",
            size: "50px",
        },
        {
            family: "Caveat",
            weight: "regular",
            size: "42px",
        },
        {
            family: "Shadows Into Light",
            weight: "regular",
            size: "42px",
        },
        {
            family: "Shadows Into Light Two",
            weight: "regular",
            size: "42px",
        },
        {
            family: "Indie Flower",
            weight: "regular",
            size: "42px",
        },
        {
            family: "Gloria Hallelujah",
            weight: "regular",
            size: "38px",
        },
        {
            family: "Single Day",
            weight: "regular",
            size: "44px",
        },
        {
            family: "Reenie Beanie",
            weight: "regular",
            size: "44px",
        },
        {
            family: "Schoolbell",
            weight: "regular",
            size: "44px",
        },
        {
            family: "Gluten",
            weight: "regular",
            size: "32px",
        },
        {
            family: "Rock Salt",
            weight: "regular",
            size: "26px",
        },
        {
            family: "Nothing You Could Do",
            weight: "regular",
            size: "32px",
        },
    ];

    useEffect(() => {
        const intervalId = setInterval(() => {
            setFontIndex(prev => {
                let newIndex;

                do {
                    newIndex = Math.floor(Math.random() * fontLoop.length);
                } while (newIndex === prev);

                // console.log(fontLoop[newIndex])

                return newIndex;
            });
        }, 180);

        return () => clearInterval(intervalId);
    }, []);

    return (<Center width="100%" height="100%" background="#0D0D0E">
        <Text
            textAlign="center"
            width="100%"
            fontFamily={fontLoop[fontIndex].family}
            fontWeight={fontLoop[fontIndex].weight}
            fontSize={fontLoop[fontIndex].size}
        >Tempo</Text>
    </Center>)
}