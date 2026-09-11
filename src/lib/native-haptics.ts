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
 * below are built out of the order: what tells two of them apart is whether
 * they rise or fall.
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
 *
 * It is a floor, not a comfortable gap. Two taps this close do register as two,
 * but they do not read as two *events*; see the patterns below.
 */
export const MIN_TAP_SPACING_MS = 70;

/**
 * How far a tap may be pushed back before it is dropped instead.
 *
 * A tap is an answer to something a finger just did. Queued behind enough
 * others it arrives attached to nothing, which is worse than silence — and a
 * backlog delivered late in a bunch is the very mush this is here to avoid.
 */
export const LATE_DROP_MS = 260;

/**
 * Only the installed app has an engine to drive. The plugin does fall back to
 * the vibration API on the web, but that is a buzz rather than a tap, and a
 * phone buzzing at somebody for opening a menu is worse than silence.
 */
const available = (): boolean =>
    Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Haptics");

function strike(feel: Feel): void {
    Haptics.impact({ style: STYLES[feel] })
        .catch(() => { /* No engine, switched off, or busy. Nothing to do. */ });
}

/**
 * When a tap may go, or null when by then it would mean nothing.
 *
 * Separated from the scheduling so the rule can be read — and tested — without
 * a clock or an engine.
 */
export function nextSlot(
    wantedAt: number,
    lastTapAt: number,
    floor = MIN_TAP_SPACING_MS,
    lateDrop = LATE_DROP_MS,
): number | null {
    const slot = Math.max(wantedAt, lastTapAt + floor);

    return (slot - wantedAt > lateDrop ? null : slot);
}

/** The last tap promised to the engine, whether it has played yet or not. */
let lastTapAt = 0;
let pending: ReturnType<typeof setTimeout>[] = [];

function forgetPending(): void {
    for (const timer of pending)
        clearTimeout(timer);

    pending = [];
}

/**
 * One tap in the queue, keeping the engine's spacing.
 *
 * `at` is when the caller wants it, in ms from now. The floor can push it
 * later than that, and far enough later it is dropped rather than delivered
 * adrift from the gesture that asked for it.
 */
function queue(feel: Feel, at: number): void {
    const now = Date.now();
    const slot = nextSlot(now + at, lastTapAt);

    if (slot === null)
        return;

    lastTapAt = slot;

    const wait = slot - now;

    if (wait <= 0) {
        strike(feel);

        return;
    }

    const timer = setTimeout(() => {
        pending = pending.filter(other => other !== timer);
        strike(feel);
    }, wait);

    pending.push(timer);
}

/**
 * Fire and forget.
 *
 * Deliberately not awaited anywhere: feedback that arrives a frame late is
 * worse than none, and a device that refuses — Low Power Mode, or a user who
 * has turned system haptics off — must not be able to interrupt the tap that
 * asked for it.
 *
 * This is the one to use for a tap that belongs to a run: a ratchet's detents,
 * or the thunk after a ker. It waits its turn and cancels nothing, because
 * there the run is the effect.
 */
export function feedback(feel: Feel): void {
    if (!available())
        return;

    queue(feel, 0);
}

/**
 * The shapes of the things a card can be told.
 *
 * A swipe left and a swipe right are the most consequential gestures in the
 * app — one tells the recommender to find more like this, the other to leave
 * it alone — and a single tap cannot say which just happened. So the two differ
 * twice over: a like rises and is quick, a pass falls and takes its time.
 * Contour and tempo together survive being felt through a pocket, in a hurry,
 * by somebody not paying attention.
 *
 * The gaps are well clear of MIN_TAP_SPACING_MS. At the floor, with a heavy
 * tap's own ring still decaying underneath the next one, these arrived as a
 * single lump that said nothing.
 */
export type Pattern =
    /** A like: a small strike and then the ring after it. A ka-ching. */
    | "reward"
    /** A pass: the firm part first and its tail after, which is the shape of "no". */
    | "refuse"
    /** Taking one back: the same thunk the menu gives for undoing something. */
    | "undone";

const PATTERNS: Record<Pattern, readonly { feel: Feel; at: number }[]> = {
    reward: [{ feel: "tick", at: 0 }, { feel: "open", at: 130 }],
    refuse: [{ feel: "open", at: 0 }, { feel: "press", at: 190 }],
    undone: [{ feel: "close", at: 0 }],
};

/** What a pattern is made of, and when each of its taps goes. */
export function patternTimeline(pattern: Pattern): { feel: Feel; at: number }[] {
    return PATTERNS[pattern].map(tap => ({ ...tap }));
}

/**
 * Play one, and let it be the only thing playing.
 *
 * Anything still queued from a moment ago is dropped first. Two quick swipes
 * used to stack their patterns, and four taps inside a third of a second is not
 * two answers — it is a buzz. The newest gesture is the one worth feeling.
 */
export function feelPattern(pattern: Pattern): void {
    if (!available())
        return;

    forgetPending();
    // Nothing is owed to the pattern that was dropped, so this one starts now
    lastTapAt = 0;

    for (const tap of patternTimeline(pattern))
        queue(tap.feel, tap.at);
}
