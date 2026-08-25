"use client";

import { Center } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { LOADER_WORDS } from "./loader-word-paths";

/**
 * The word "Tempo", rewritten in a different handwriting five times a second.
 *
 * Drawn as outlines rather than set in twelve fonts. Fonts have to arrive, and
 * a screen that changes this fast gave twelve chances to catch the word
 * mid-download and show it in a fallback face instead - which is the one hand
 * that is not handwriting at all, and is the most conspicuous thing on an
 * otherwise still screen. Waiting for all twelve first removed most of it and
 * left a flicker on the first pass; there is nothing to wait for now.
 *
 * See scripts/generate-loader-paths.mjs for where the outlines come from.
 */
export default function FullLoader() {
    const [index, setIndex] = useState<number>(0);

    useEffect(() => {
        const intervalId = setInterval(() => {
            setIndex(prev => {
                let next;

                do {
                    next = Math.floor(Math.random() * LOADER_WORDS.length);
                } while (next === prev);

                return next;
            });
        }, 200);

        return () => clearInterval(intervalId);
    }, []);

    const word = LOADER_WORDS[index];

    return (<Center width="100%" height="100%" background="#0D0D0E">
        <svg
            width={word.width}
            height={word.height}
            viewBox={word.viewBox}
            // The outlines carry no colour of their own, so they take the
            // text colour around them as the words used to
            fill="currentColor"
            role="img"
            aria-label="Tempo"
        >
            <path d={word.path} />
        </svg>
    </Center>);
}
