"use client";

import { Text, Center } from "@chakra-ui/react";
import { useEffect, useState } from "react";

/**
 * The word "Tempo", handwritten in a different hand every fifth of a second.
 *
 * Hoisted out of the component so the list is one object rather than a new one
 * on every render, which matters here because the effect below depends on it.
 */
const FONT_LOOP: {
    family: string;
    weight: string;
    size: string;
}[] = [
    { family: "Nanum Pen Script", weight: "regular", size: "50px" },
    { family: "Caveat", weight: "regular", size: "42px" },
    { family: "Shadows Into Light", weight: "regular", size: "42px" },
    { family: "Shadows Into Light Two", weight: "regular", size: "42px" },
    { family: "Indie Flower", weight: "regular", size: "42px" },
    { family: "Gloria Hallelujah", weight: "regular", size: "38px" },
    { family: "Single Day", weight: "regular", size: "44px" },
    { family: "Reenie Beanie", weight: "regular", size: "44px" },
    { family: "Schoolbell", weight: "regular", size: "44px" },
    { family: "Gluten", weight: "regular", size: "32px" },
    { family: "Rock Salt", weight: "regular", size: "26px" },
    { family: "Nothing You Could Do", weight: "regular", size: "32px" },
];

/** The one word this ever renders, so only its glyphs need to arrive. */
const WORD = "Tempo";

/**
 * Long enough for twelve small font files, short enough not to be a wait.
 *
 * Reaching it means starting anyway: a loading screen that will not draw
 * because its decoration has not arrived is worse than one that flickers.
 */
const FONT_TIMEOUT_MS = 3000;

export default function FullLoader() {
    const [fontIndex, setFontIndex] = useState<number>(0);
    const [ready, setReady] = useState(false);

    /*
     * Every hand is fetched before the first is shown.
     *
     * The stylesheet in the document head only describes these families; the
     * files themselves are not fetched until something is painted in one. So
     * each font arrived as it came up in the loop, and the word snapped from a
     * fallback into the real hand a fifth of a second later - twelve times
     * over, which is the flicker.
     */
    useEffect(() => {
        let cancelled = false;

        const start = () => {
            if (!cancelled)
                setReady(true);
        };

        if (typeof document === "undefined" || !document.fonts) {
            start();

            return;
        }

        // Whichever comes first: every hand loaded, or the wait being over
        const giveUp = setTimeout(start, FONT_TIMEOUT_MS);

        Promise.all(FONT_LOOP.map((font) =>
            document.fonts.load(`${font.weight} ${font.size} "${font.family}"`, WORD).catch(() => undefined)))
            .then(start)
            .catch(start);

        return () => {
            cancelled = true;

            clearTimeout(giveUp);
        };
    }, []);

    useEffect(() => {
        if (!ready)
            return;

        const intervalId = setInterval(() => {
            setFontIndex(prev => {
                let newIndex;

                do {
                    newIndex = Math.floor(Math.random() * FONT_LOOP.length);
                } while (newIndex === prev);

                return newIndex;
            });
        }, 200);

        return () => clearInterval(intervalId);
    }, [ready]);

    return (<Center width="100%" height="100%" background="#0D0D0E">
        <Text
            textAlign="center"
            width="100%"
            fontFamily={FONT_LOOP[fontIndex].family}
            fontWeight={FONT_LOOP[fontIndex].weight}
            fontSize={FONT_LOOP[fontIndex].size}
            // Held back rather than shown in a fallback: the first frame would
            // otherwise be the one hand that is not handwriting at all
            opacity={ready ? 1 : 0}
            transition="opacity .2s"
        >Tempo</Text>
    </Center>)
}
