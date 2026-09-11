import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

/**
 * The taps the Taptic Engine gives back.
 *
 * Glass has no travel and no click, so a control made of it has nothing to
 * report back when a finger lands on it — which is what makes an untapped glass
 * button feel like a picture of a button. This is the other half of that.
 *
 * Intents rather than strengths, because the strengths are a judgement about
 * how each gesture should feel and belong in one place. A call site asking for
 * "medium" has to know what medium is for; one asking to open does not.
 */

export type Feel =
    /**
     * The "ker" of a ker-thunk: a finger landing on a button. Light and crisp,
     * a click with nothing decided yet — the button has only been pressed.
     */
    | "press"
    /** The thunk of letting go on the button, as the stack comes up. The deepest there is. */
    | "open"
    /** The thunk of putting it away again: firm, but lighter, being an undo rather than an act. */
    | "close"
    /** The thunk of letting go on a row: committing to it, just before the screen changes. */
    | "choose"
    /**
     * One detent of a ratchet, as a single item arrives. Among the lightest:
     * there are several in a row, and each one is punctuation rather than an
     * event in its own right.
     */
    | "tick";

const STYLES: Record<Feel, ImpactStyle> = {
    press: ImpactStyle.Light,
    open: ImpactStyle.Heavy,
    close: ImpactStyle.Medium,
    choose: ImpactStyle.Heavy,
    tick: ImpactStyle.Light,
};

/**
 * How firm each tap is, on a scale of three.
 *
 * The engine's own styles are an enum with no order to them, and the patterns
 * below are built out of the order: what makes two of them tell apart is
 * whether they rise or fall.
 */
export const FEEL_WEIGHT: Record<Feel, 1 | 2 | 3> = {
    press: 1,
    tick: 1,
    close: 2,
    open: 3,
    choose: 3,
};

/**
 * The closest two taps can be and still be felt as two taps.
 *
 * The engine needs time to settle between impacts; asked for them faster than
 * this it runs them together into something closer to a buzz, and starts
 * dropping them. Anything scheduling a run of taps should space them by at
 * least this much — which makes it a constraint on the animation they
 * accompany, not just on the haptics.
 */
export const MIN_TAP_SPACING_MS = 70;

/**
 * Only the installed app has an engine to drive. The plugin does fall back to
 * the vibration API on the web, but that is a buzz rather than a tap, and a
 * phone buzzing at somebody for opening a menu is worse than silence.
 */
const available = (): boolean =>
    Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Haptics");

/**
 * Fire and forget.
 *
 * Deliberately not awaited anywhere: feedback that arrives a frame late is
 * worse than none, and a device that refuses — Low Power Mode, or a user who
 * has turned system haptics off — must not be able to interrupt the tap that
 * asked for it.
 */
export function feedback(feel: Feel): void {
    if (!available())
        return;

    Haptics.impact({ style: STYLES[feel] })
        .catch(() => { /* No engine, switched off, or busy. Nothing to do. */ });
}

/**
 * Two-tap shapes, for the two answers a song can be given.
 *
 * A swipe left and a swipe right are the most consequential gestures in the
 * app — one tells the recommender to find more like this, the other to leave it
 * alone — and a single tap cannot say which of the two just happened. So they
 * are told apart by contour rather than by strength: a like rises, a pass
 * falls. A direction is legible through a pocket in a way that two taps of
 * different firmness are not.
 */
export type Pattern =
    /** A like: a small strike and then the ring after it. A ka-ching. */
    | "reward"
    /** A pass: the firm part first and its tail after, which is the shape of "no". */
    | "refuse";

const PATTERNS: Record<Pattern, readonly Feel[]> = {
    reward: ["tick", "open"],
    refuse: ["open", "press"],
};

/** When each tap of a pattern goes, in ms from the first. */
export function patternTimeline(
    pattern: Pattern,
    spacing = MIN_TAP_SPACING_MS,
): { feel: Feel; at: number }[] {
    return PATTERNS[pattern].map((feel, tap) => ({ feel, at: tap * spacing }));
}

/** Plays a pattern, spaced far enough apart that it is felt as separate taps. */
export function feelPattern(pattern: Pattern): void {
    for (const { feel, at } of patternTimeline(pattern)) {
        if (at === 0)
            feedback(feel);
        else
            setTimeout(() => feedback(feel), at);
    }
}
