import { useEffect, useMemo, useState } from "react";

/**
 * Things that took about as long as somebody has spent listening.
 *
 * A figure on its own is hard to have a feeling about — nobody knows whether
 * eleven hours is a lot. Something that took the same eleven hours does the
 * comparing for them.
 *
 * Every duration here is the real one, and they are spread deliberately rather
 * than collected: a week of listening runs from about half an hour up to 168,
 * which is the week itself, and a band with one fact in it shows the same line
 * every week until it stops being interesting. Most totals have four or more to
 * choose between.
 */
export type ListeningFact = {
    /** How long the thing itself took. */
    ms: number;
    /** Reads directly after "About as long as ". */
    label: string;
};

const mins = (minutes: number) => minutes * 60e3;
const hrs = (hours: number, minutes = 0) => (hours * 60 + minutes) * 60e3;

export const LISTENING_FACTS: readonly ListeningFact[] = [
    // Under an hour
    { ms: mins(38), label: "the shortest war in history" },
    { ms: mins(43), label: "The Dark Side of the Moon, start to finish" },
    { ms: mins(47), label: "Abbey Road, start to finish" },

    // An evening
    { ms: hrs(1), label: "Blonde, start to finish" },
    { ms: hrs(1, 32), label: "one orbit of the Earth on the ISS" },
    { ms: hrs(1, 48), label: "Gagarin's flight — the first person in space" },
    { ms: hrs(2, 31), label: "Armstrong and Aldrin's moonwalk" },
    { ms: hrs(2, 40), label: "the Titanic took to sink" },
    { ms: hrs(2, 53), label: "Concorde's fastest crossing of the Atlantic" },

    // An afternoon
    { ms: hrs(3, 2), label: "Avengers: Endgame" },
    { ms: hrs(3, 15), label: "a night of the Eras Tour" },
    { ms: hrs(4, 33), label: "the average marathon" },
    { ms: hrs(4, 57), label: "the longest Wimbledon final ever played" },

    // A long day
    { ms: hrs(6, 46), label: "season one of Stranger Things" },
    { ms: hrs(8, 56), label: "the longest spacewalk anybody has done" },
    { ms: hrs(9, 45), label: "the Beatles needed to record their first album" },
    { ms: hrs(11, 5), label: "the longest tennis match ever played" },

    // Around a day
    { ms: hrs(13, 2), label: "season four of Stranger Things" },
    { ms: hrs(18, 50), label: "the longest scheduled flight in the world" },
    { ms: hrs(19, 39), label: "every Harry Potter film back to back" },
    { ms: hrs(20, 15), label: "the longest chess game ever played" },
    { ms: hrs(21, 36), label: "Armstrong and Aldrin spent on the Moon" },
    { ms: hrs(24), label: "the Le Mans 24 Hours" },

    // A few days
    { ms: hrs(32), label: "finishing the story in GTA V" },
    { ms: hrs(39, 12), label: "every Studio Ghibli film" },
    { ms: hrs(42), label: "finishing Elden Ring" },
    { ms: hrs(45), label: "every episode of Stranger Things" },
    { ms: hrs(60), label: "the cutoff at the Barkley Marathons" },
    { ms: hrs(65), label: "Elden Ring, taking your time with it" },
    { ms: hrs(75, 49), label: "Apollo 11's flight out to the Moon" },
    { ms: hrs(76), label: "the winning ride at the 2025 Tour de France" },
    { ms: hrs(76, 42), label: "every episode of The Office" },

    // Most of a week
    { ms: hrs(90, 54), label: "every episode of Friends" },
    { ms: hrs(99, 30), label: "a completionist run of Elden Ring" },
    { ms: hrs(113), label: "an average playthrough of Baldur's Gate 3" },
    { ms: hrs(131, 14), label: "every Marvel film ever released" },
    { ms: hrs(141), label: "a completionist run of Persona 5 Royal" },
    { ms: hrs(142, 54), label: "the whole Apollo 13 mission, launch to splashdown" },
];

/**
 * How far off a fact may be and still be worth drawing.
 *
 * Loose enough that most totals find something — "about as long as" is not a
 * claim of precision — and tight enough that a quiet week is never told it
 * listened for as long as it takes to finish Elden Ring.
 */
const TOLERANCE = 1.35;

export function factsFor(totalMs: number): ListeningFact[] {
    if (totalMs <= 0)
        return [];

    return LISTENING_FACTS.filter(fact => {
        const ratio = totalMs / fact.ms;

        return (ratio >= 1 / TOLERANCE && ratio <= TOLERANCE);
    });
}

/**
 * The fact to show for a week of listening.
 *
 * Picked from the total rather than at random, so the same week always says the
 * same thing — a line that changed on every render would read as broken — while
 * a different week lands on a different fact.
 *
 * With `?facts` in the URL it cycles the whole list instead, two seconds each,
 * so the whole set can be looked at without inventing a week to match each one.
 * Development only: the query string cannot switch it on in a production build.
 */
export function useListeningFact(totalMs: number): ListeningFact | undefined {
    const candidates = useMemo(() => factsFor(totalMs), [totalMs]);

    const [rotating, setRotating] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (process.env.NODE_ENV === "production")
            return;

        setRotating(new URLSearchParams(window.location.search).has("facts"));
    }, []);

    useEffect(() => {
        if (!rotating)
            return;

        const id = setInterval(() => setTick(v => v + 1), 2000);

        return () => clearInterval(id);
    }, [rotating]);

    if (rotating)
        return LISTENING_FACTS[tick % LISTENING_FACTS.length];

    if (candidates.length === 0)
        return undefined;

    return candidates[Math.floor(totalMs / 60e3) % candidates.length];
}
