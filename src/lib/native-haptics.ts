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
