"use client";

import { Box, Center, HStack, Text, type BoxProps } from "@chakra-ui/react";
import { AnimatePresence, motion, type TargetAndTransition } from "framer-motion";
import { CircleUser, Compass, Globe, ListMusic, ListPlus, Plus, Trophy, UserPlus, Users, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GLASS_TRANSITION, glassPress, glassSurface } from "@/lib/liquid-glass";
import { GlassHalo } from "./glass-halo";
import { MIN_TAP_SPACING_MS, feedback, type Feel } from "@/lib/native-haptics";
import { BUTTON_FADE_MS, DISSOLVE_MS, fizzle } from "@/lib/fizzle";

const MotionBox = motion.create(Box);
const MotionText = motion.create(Text);

/**
 * glassSurface, for glass that animates itself. It is typed as a whole Box's
 * props, and some of a Box's props mean something else on a motion element —
 * `transition` above all, a CSS string to Chakra and an animation to framer —
 * so only what it actually sets is passed on.
 */
const motionGlass = (
    options: Parameters<typeof glassSurface>[0],
): Pick<BoxProps, "borderRadius" | "backgroundColor" | "backdropFilter" | "boxShadow" | "style"> => {
    const { borderRadius, backgroundColor, backdropFilter, boxShadow, style } = glassSurface(options);
    return { borderRadius, backgroundColor, backdropFilter, boxShadow, style };
};

/**
 * What the button opens onto.
 *
 * A "page" is somewhere to go and an "action" is something to start; the menu
 * draws them the same way but treats them differently when deciding what to
 * show — there is no sense in offering a jump to the page you are already on,
 * while an action is worth offering from anywhere.
 *
 * Top of the stack first, which is the reverse of the order they arrive in:
 * the item nearest the button is revealed first, being the one the thumb is
 * already next to.
 */
export type ActionMenuItem = {
    id: string;
    label: string;
    icon: LucideIcon;
    kind: "page" | "action";
};

/*
 * Every top-level page is here, because this is now the only way between them:
 * the title used to open a switcher and no longer does. The pages run in the
 * order that switcher listed them.
 *
 * The icons pair up on purpose — a person and a person-plus, a playlist and a
 * playlist-plus — so a page and the action that adds to it read as related.
 */
export const ACTION_MENU_ITEMS: ActionMenuItem[] = [
    { id: "add-friends", label: "Add Friends", icon: UserPlus, kind: "action" },
    { id: "create-playlist", label: "New Playlist", icon: ListPlus, kind: "action" },
    { id: "friends", label: "Friends", icon: Users, kind: "page" },
    { id: "discover", label: "Discover", icon: Compass, kind: "page" },
    { id: "leaderboard", label: "Leaderboard", icon: Trophy, kind: "page" },
    { id: "passport", label: "Passport", icon: Globe, kind: "page" },
    { id: "playlists", label: "Playlists", icon: ListMusic, kind: "page" },
    { id: "settings", label: "Profile", icon: CircleUser, kind: "page" },
];

/**
 * An action a page keeps out on its own, floating above the menu button, so
 * the thing that page is for is one tap away rather than two.
 *
 * It lives in the menu as well — other pages still need to reach it — but the
 * two never show at once: the pinned one gets out of the way as the menu
 * opens, and comes back once it has closed.
 */
/**
 * A pinned action a page supplies itself, for when what it pins is not a menu
 * item — opening the recap drawer from the profile, say. It takes precedence
 * over PINNED_ACTIONS.
 */
export type PinnedAction = {
    id: string;
    label: string;
    /** Defaults to a plus, which suits adding things; say otherwise for anything else. */
    icon?: LucideIcon;
    run: () => void;
};

export const PINNED_ACTIONS: Record<string, string> = {
    friends: "add-friends",
    playlists: "create-playlist",
};

/**
 * The button's glyph: three strokes that are a menu, a cross, or a back arrow.
 *
 * One drawing in three poses rather than three icons swapped over, so every
 * change of meaning is something the user watches happen. For the cross the
 * outer strokes swing in to meet and the middle one goes; for the arrow the
 * middle one stays as the shaft and the outer two shorten into its head.
 *
 * Each pose is the strokes' own end points, animated as SVG attributes. The
 * first version rotated and translated whole strokes with CSS transforms,
 * which the iOS web view does not apply to SVG lines: the middle stroke faded
 * as asked, the outer two never moved, and the cross came out as "=". End
 * points are plain attributes, so there is nothing for WebKit to drop — and
 * the cross and the arrow are drawn exactly rather than arrived at by rotating.
 *
 * Every stroke runs left to right in every pose, so each end travels to its
 * counterpart rather than the stroke flipping over on the way.
 */
type Glyph = "menu" | "cross" | "back";
type Stroke = { x1: number; y1: number; x2: number; y2: number };

/** Half the cross's arm: a 14-unit stroke laid at 45 degrees about the centre. */
const ARM = 7 / Math.SQRT2;

const GLYPH_TOP: Record<Glyph, Stroke> = {
    menu: { x1: 5, y1: 7, x2: 19, y2: 7 },
    cross: { x1: 12 - ARM, y1: 12 - ARM, x2: 12 + ARM, y2: 12 + ARM },
    back: { x1: 5, y1: 12, x2: 10.5, y2: 6.5 },
};
const GLYPH_MIDDLE: Record<Glyph, Stroke & { opacity: number }> = {
    menu: { x1: 5, y1: 12, x2: 19, y2: 12, opacity: 1 },
    // Drawn in to the centre as it goes, so it vanishes into the crossing.
    cross: { x1: 12, y1: 12, x2: 12, y2: 12, opacity: 0 },
    back: { x1: 5, y1: 12, x2: 19, y2: 12, opacity: 1 },
};
const GLYPH_BOTTOM: Record<Glyph, Stroke> = {
    menu: { x1: 5, y1: 17, x2: 19, y2: 17 },
    cross: { x1: 12 - ARM, y1: 12 + ARM, x2: 12 + ARM, y2: 12 - ARM },
    back: { x1: 5, y1: 12, x2: 10.5, y2: 17.5 },
};

/**
 * Every floating control is one size, with one gap between them.
 *
 * The menu button, the button beside it, the pinned action's height and the
 * rows of the open stack were each sized on their own — 58, 46, 44 and 52 —
 * with 14 between the rows but 12 beside the button. Side by side that read as
 * four things that happened to be near each other rather than one set. One
 * size makes a grid: the stack's circles run straight up from the button, the
 * button beside it sits level, and the pinned action is the same height as
 * both. 52 is comfortably over the 44 a thumb needs; the menu button is marked
 * out by where it sits, and by its thicker glass when open, not by being bigger.
 */
const CONTROL_SIZE = 52;
const CONTROL_GAP = 12;

const BUTTON_SIZE = CONTROL_SIZE;

/** The companion button that can sit beside the menu button: the same size, a gap along. */
const BESIDE_SIZE = CONTROL_SIZE;
const BESIDE_GAP = CONTROL_GAP;
/** The companion and menu buttons side by side, edge to edge. */
const PAIR_WIDTH = BESIDE_SIZE + BESIDE_GAP + BUTTON_SIZE;

/**
 * How far a finger may drift off a button and still have its release count,
 * in px. iOS allows roughly this much; any tighter and a thumb that rolled
 * slightly as it lifted would find its press quietly thrown away.
 */
const RELEASE_SLOP = 24;
const ITEM_SIZE = CONTROL_SIZE;
const ITEM_GAP = CONTROL_GAP;

/**
 * How far apart in time each item arrives.
 *
 * Small enough that the stack reads as one movement rather than five, large
 * enough that the eye can follow it upwards — and, since each arrival is also
 * a tap, no closer together than the engine can articulate. It was 35ms on
 * looks alone, which the Taptic Engine would have run together into a buzz;
 * the haptics are what set it now, and the animation follows them.
 */
const STAGGER = MIN_TAP_SPACING_MS / 1000;

/**
 * A spring rather than a curve, so the stack settles instead of stopping.
 * Nothing here animates blur or the backdrop: both force a repaint of
 * everything behind the material every frame, which on a phone shows.
 */
const SPRING = { type: "spring" as const, stiffness: 460, damping: 34, mass: 0.7 };

/**
 * How long a choice stays on screen before the menu lets go of it.
 *
 * Long enough to read as an answer — the row you touched, still lit, with
 * everything else gone — and short enough that nobody waits on it. The new page
 * is already rendering underneath the whole time, so this is not a delay before
 * the navigation, only before the reveal of it.
 */
export const CHOICE_HOLD_MS = 450;

/**
 * The slam: how each row lands.
 *
 * A row wakes up dim, flares past full brightness one step later, and settles.
 * The step is the stagger, so the flare is always exactly one row behind the
 * arrival: at any moment the row coming in is dim, the one below it is bright,
 * and everything further down is back to normal. That offset is what reads as
 * a wave slamming up the stack rather than rows each flickering on their own.
 *
 * It also puts the haptics on the flashes. Each row's tick fires as it
 * arrives, which is the moment the row below it peaks.
 *
 * Kept as constants, not written inline: framer re-runs an animation when its
 * target changes, and a fresh array on every render would restart the flash
 * each time anything else in the menu updated.
 */
const SLAM_PEAK_S = STAGGER;
const SLAM_S = STAGGER * 2.6;
/** Dim for most of its first step, flared by the end of it, settled after. */
const SLAM_TIMES = [0, (STAGGER * 0.65) / SLAM_S, SLAM_PEAK_S / SLAM_S, 1];
const SLAM_EASE = ["linear", "easeIn", "easeOut"];

/**
 * No filters anywhere in the slam, and that is load-bearing.
 *
 * The first version flared each label with a CSS brightness filter. A filter
 * gives its element its own offscreen layer, and six of them arriving at once,
 * on top of seven glass buttons and a full-screen blur, made the first frame of
 * the menu so expensive that on the simulator — which draws all of this on the
 * CPU — every animation had finished before anything was painted: the menu
 * appeared fully open, with no arrival at all, scrim included.
 *
 * So the slam is built only from what the compositor can do alone. Dim is
 * opacity. Brighter-than-normal is a glow in the label's own text shadow. And
 * the glass, which a filter would also have stopped blurring (in WebKit a
 * filtered element becomes a backdrop root), is lit from inside by two fixed
 * layers — a shade and a wash — each only ever fading.
 */

/**
 * The label's resting shadow. The label sits on the page, not on glass, so it
 * carries its own shadow to stay readable over whatever it crosses; the slam
 * borrows the same shadow as its glow and hands it back unchanged.
 */
const LABEL_SHADOW = "0px 1px 12px rgba(0,0,0,0.75)";
const LABEL_GLOW = "0px 0px 8px rgba(255,255,255,0.75)";

const SLAM_LABEL_REST = { opacity: 0.38, textShadow: LABEL_SHADOW };
const SLAM_LABEL = {
    opacity: [0.38, 0.38, 1, 1],
    textShadow: [LABEL_SHADOW, LABEL_SHADOW, LABEL_GLOW, LABEL_SHADOW],
};

/** Over the glass: a shade that lifts as it wakes… */
const SLAM_SHADE = { opacity: [1, 1, 0, 0] };
/** …and a wash that flares as the shade goes, then clears. */
const SLAM_WASH = { opacity: [0, 0, 1, 0] };

/**
 * Leaving, in both its forms, is a fall: a row drops a little, shrinks a
 * little, blurs, and is gone, on an ease that accelerates the way something
 * dropped does. Quicker than arriving — the reveal is the moment worth
 * watching; the dismissal just needs to be out of the way.
 *
 * The blur is a filter, and filters are expensive: six of them arriving at
 * once is what swallowed the whole entrance on the simulator. So it only ever
 * runs on the way out, stays small, and is given back the moment a row is
 * invisible.
 */
const FALL_S = 0.2;
const FALL_Y = 16;
const FALL_EASE = "easeIn" as const;
const FALL_BLUR = "blur(6px)";

/**
 * When the pinned action comes back after the menu closes: once the falling
 * rows are clear of the space it sits in, so the two are never seen crossing.
 */
const PINNED_RETURN_S = 0.2;

/*
 * How the pinned and companion buttons come and go: the wrapper moves, and the
 * glass inside it fades itself. Never the wrapper — an ancestor below full
 * opacity cuts glass off from the page behind it (WebKit makes it a backdrop
 * root), so a fading wrapper showed the page sharp through a bare tint for the
 * whole fade, every time the profile came back from Settings. The labels pass
 * down to the glass, exit included.
 */
const PINNED_MOVE = {
    away: { y: 8 },
    here: { y: 0, transition: { ...SPRING, delay: PINNED_RETURN_S } },
    leaving: { y: 8, scale: 0.96, transition: { duration: 0.12, ease: "easeIn" as const } },
};
const BESIDE_MOVE = {
    away: { x: 8 },
    here: { x: 0, transition: { ...SPRING, delay: PINNED_RETURN_S } },
    leaving: { x: 8, scale: 0.9, transition: { duration: 0.12, ease: "easeIn" as const } },
};
const GLASS_FADE = {
    away: { opacity: 0 },
    here: { opacity: 1, transition: { ...SPRING, delay: PINNED_RETURN_S } },
    leaving: { opacity: 0, transition: { duration: 0.12, ease: "easeIn" as const } },
};

/**
 * The rows not chosen, getting out of the way of the one that was. By
 * transform only, so nothing reflows and the chosen row does not move an inch;
 * the blur is handed back once they are gone, so five invisible rows are not
 * left holding a filter each for the length of the dissolve.
 */
const RECEDE_TARGET = {
    opacity: 0,
    y: 10,
    scale: 0.92,
    filter: "blur(5px)",
    transitionEnd: { filter: "none" },
};
const RECEDE = { duration: FALL_S, ease: FALL_EASE };

/**
 * Closing without a choice: every row drops to a baseline at once — dimmer,
 * and just starting to blur — then falls away on a tight wave from the
 * bottom.
 *
 * The baseline answers the tap everywhere immediately; without it the rows
 * still to go sat at full strength waiting their turn, a menu that looked as
 * though it had not heard the close. The wave going out is far tighter than
 * the one coming in, so the whole stack is gone in about a third of a second.
 *
 * The stagger is bounded by the longest list: every item at once must still
 * be out inside 0.4s. Seven items would leave plenty of room at 0.028; nine,
 * with the playlist options in, need 0.024.
 */
export const CLOSE_BASELINE = 0.5;
export const CLOSE_BASELINE_S = 0.08;
export const CLOSE_STAGGER_S = 0.024;
const BASELINE_BLUR = "blur(1.5px)";

export function rowExit(fromBottom: number, holding: boolean): TargetAndTransition {
    /*
     * After a choice the other rows have already fallen away, and the chosen
     * one has been taken apart by its dissolve. A baseline here would lift
     * them back to it for a moment on their way out.
     */
    if (holding)
        return { opacity: 0, transition: { duration: 0.2 } };

    const turn = fromBottom * CLOSE_STAGGER_S;
    const wait = Math.max(turn, CLOSE_BASELINE_S);
    const total = wait + FALL_S;
    const times = [0, CLOSE_BASELINE_S / total, wait / total, 1];
    const ease = ["easeOut", "linear", FALL_EASE];

    return {
        opacity: [null, CLOSE_BASELINE, CLOSE_BASELINE, 0],
        filter: ["blur(0px)", BASELINE_BLUR, BASELINE_BLUR, FALL_BLUR],
        y: FALL_Y,
        scale: 0.9,
        transition: {
            opacity: { duration: total, times, ease },
            filter: { duration: total, times, ease },
            y: { duration: FALL_S, ease: FALL_EASE, delay: turn },
            scale: { duration: FALL_S, ease: FALL_EASE, delay: turn },
        },
    };
}

/*
 * A row's moves, split between the things that can carry them.
 *
 * A row is a glass button with a label, and glass cannot sit inside anything
 * that fades or blurs: WebKit makes that ancestor a backdrop root, and the glass
 * shows the page through a bare tint for as long as the fade lasts — which is
 * every arrival, every recede and every close. So the row itself only moves;
 * its label fades and blurs in a wrapper of its own; and the glass fades itself,
 * without a blur, which keeps the number of filters where it was. rowExit and
 * RECEDE_TARGET stay whole, as the one description of each move, and are cut
 * up here.
 */
export const ROW_MOVE_KEYS = ["y", "scale"];
export const ROW_FADE_KEYS = ["opacity", "filter"];
export const GLASS_FADE_KEYS = ["opacity"];

/**
 * Part of a move: only the properties in `keys`, with their own transitions and
 * whatever they settle to. A transition shared by every property goes to each
 * part whole, so the parts stay in step.
 */
export function part(target: TargetAndTransition, keys: readonly string[]): TargetAndTransition {
    const source = target as Record<string, any>;
    const out: Record<string, any> = {};

    for (const key of keys) {
        if (key in source)
            out[key] = source[key];
    }

    const transition = source.transition;

    if (transition) {
        const own = keys.filter(key => key in transition);

        out.transition = own.length > 0
            ? Object.fromEntries(own.map(key => [key, transition[key]]))
            : transition;
    }

    if (source.transitionEnd) {
        const end = Object.fromEntries(
            Object.entries(source.transitionEnd).filter(([key]) => keys.includes(key)),
        );

        if (Object.keys(end).length > 0)
            out.transitionEnd = end;
    }

    return out as TargetAndTransition;
}

/**
 * Enter and Space, as a native button takes them.
 *
 * The controls here are divs acting as buttons, so they can carry the
 * ker-thunk on pointer down and up; that left them unreachable from a
 * keyboard, and on a sub-page the menu button is the only way back. A key
 * press does the same thing without the haptics.
 */
const onActivateKey = (run: () => void) => (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ")
        return;

    e.preventDefault();
    run();
};

export default function GlassActionMenu({
    open,
    setOpen,
    currentPage,
    onNavigate,
    onBack,
    pinned,
    tint,
    topCard,
    glow,
    beside,
    hidden,
}: Readonly<{
    open: boolean;
    setOpen: (open: boolean) => void;
    currentPage: string;
    onNavigate: (id: string, kind: ActionMenuItem["kind"]) => void;
    /**
     * On a sub-page, the way back. The button becomes it — an arrow, going
     * back on release — rather than a menu, since a sub-page is somewhere you
     * were sent and the thing to do next is return. It is the only exit a
     * sub-page has: the title no longer carries one.
     */
    onBack?: () => void;
    /** A pinned action from the page itself, in place of the one PINNED_ACTIONS gives it. */
    pinned?: PinnedAction;
    /**
     * The page's colour — the one its title is drawn in. The glass reflects it
     * and the icons and labels are drawn in it, so the controls belong to the
     * page they are on rather than sitting on it in grey.
     */
    tint?: string;
    /**
     * Something to drop in from the top while the menu is open — what you are
     * playing. The bottom of the screen belongs to the stack now, and the top
     * is nothing but blurred scrim while the menu is up, so that is where it
     * goes. Display only: taps pass through it to the scrim, which closes the
     * menu as a tap anywhere else outside the stack would.
     */
    topCard?: React.ReactNode;
    /**
     * The colours of the song a page is showing — the palette its wash is made
     * of. The floating controls wear them as a halo along their top edge, so
     * they catch the light of the page above them. Two or more, or none.
     */
    glow?: readonly string[];
    /**
     * A second control, round, beside the menu button — the profile's settings,
     * which used to be a cog in its header. Shown while the menu is shut, like
     * the pinned action above, and away while it is open.
     */
    beside?: PinnedAction;
    /** Recaps take the button away. */
    hidden?: boolean;
}>) {
    /*
     * The row just chosen, and the stack exactly as it stood when it was.
     *
     * Frozen because navigation happens at once and changes the page, and the
     * page decides which rows exist: the one chosen would drop out as its own
     * page arrived, and the page just left would put its row back. Either would
     * rearrange the stack under the one row that is meant to be holding still.
     */
    const [chosen, setChosen] = useState<{
        id: string;
        items: ActionMenuItem[];
        /** Past the hold, and turning to dust. */
        dissolving: boolean;
    } | null>(null);
    const holding = chosen !== null;
    const dissolving = chosen?.dissolving ?? false;

    /** The stack, so the chosen row can be found without searching the page. */
    const stack = useRef<HTMLDivElement>(null);

    const live = ACTION_MENU_ITEMS.filter(
        (v) => !(v.kind === "page" && v.id === currentPage),
    );

    const items = chosen ? chosen.items : live;

    const mapped = ACTION_MENU_ITEMS.find((v) => v.id === PINNED_ACTIONS[currentPage]);
    const pin: PinnedAction | undefined = pinned ?? (mapped && {
        id: mapped.id,
        label: mapped.label,
        run: () => onNavigate(mapped.id, mapped.kind),
    });
    const PinIcon = pin?.icon ?? Plus;
    const BesideIcon = beside?.icon ?? Plus;

    /* Only the floating controls wear the halo — never the rows of the open stack. */
    const halo = glow && glow.length >= 2 ? glow : null;

    /* The ink for icons and labels: the page's colour, or the app's own lavender. */
    const ink = tint || "#E9E7FB";

    /* Open wins: the button is a cross whenever the menu is up, whatever page it is on. */
    const glyph: Glyph = open ? "cross" : onBack ? "back" : "menu";

    /*
     * The array is rebuilt on every render, so the ratchet counts rows off
     * this rather than off the array's identity.
     */
    const itemCount = items.length;

    /*
     * Choosing an action sends the shell to a sub-page, and sub-pages take the
     * button away — which would snatch the choice off screen the moment it was
     * made. For the length of the hold the menu stays regardless, and lets the
     * sub-page have its way once the beat is over.
     */
    const effectivelyHidden = !!hidden && !holding;

    /*
     * A menu left open behind a page change is a menu the user did not choose
     * to reopen — and on a sub-page the button itself is gone, so there would
     * be nothing left to close it with.
     */
    useEffect(() => {
        if (effectivelyHidden && open) setOpen(false);
    }, [effectivelyHidden, open, setOpen]);

    const hold = useRef<ReturnType<typeof setTimeout> | null>(null);

    /*
     * Which opening this is. Every open gets rows of its own, keyed on it.
     *
     * Reopened before the last close has finished — and framer waits for every
     * row to finish leaving before it removes any — the menu otherwise got the
     * same rows back rather than new ones, still wearing whatever the close
     * had got as far as. The slam did not play again, its target being the
     * same constant as before; the label's exit blur, interrupted, was never
     * given back, so every label sat behind a permanent smear; and a row the
     * dissolve had taken apart came back as an empty slot. New keys mean new
     * rows: the old ones finish falling, the new ones arrive from the start.
     *
     * Counted here, during render, rather than in an effect: an effect would
     * bump it a render after the rows had already mounted, and remount them.
     */
    const opening = useRef(0);
    const wasOpen = useRef(false);

    if (open && !wasOpen.current)
        opening.current += 1;

    wasOpen.current = open;

    /*
     * Stops the last choice's dust. The dissolve draws on a canvas over the
     * whole page for longer than the menu takes to close after it, so a menu
     * reopened inside that window came up under dust still falling — and a
     * second choice in the same window stacked a second canvas on the first.
     * The rows it took apart are no longer a concern, being a past opening's
     * now; the canvas is, and opening finishes it.
     */
    const undoFizzle = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!open || !undoFizzle.current) return;
        undoFizzle.current();
        undoFizzle.current = null;
    }, [open]);

    /*
     * A menu shut from outside while a choice is held has nothing left to hold
     * it on, so the choice goes with it rather than being stranded for the next
     * time the menu opens.
     */
    useEffect(() => {
        if (!open && chosen) {
            if (hold.current) clearTimeout(hold.current);
            hold.current = null;
            setChosen(null);
        }
    }, [open, chosen]);

    useEffect(() => () => {
        if (hold.current) clearTimeout(hold.current);
    }, []);

    const ticks = useRef<ReturnType<typeof setTimeout>[]>([]);

    /*
     * A tap per item as it arrives, so the stack can be felt coming up as well
     * as watched: the same rhythm as the reveal, one detent per row.
     *
     * The row nearest the button is not given one. It starts moving at the
     * moment of the press, and the press has already produced a firmer tap of
     * its own — two at once reads as one muddy thump rather than as the first
     * click of a ratchet, which is what the press is standing in for.
     *
     * Cleanup matters more than the effect: a run of taps outlives the gesture
     * that started it, so a menu dismissed halfway through the reveal would go
     * on ticking at somebody after it had gone.
     */
    useEffect(() => {
        const clear = () => {
            ticks.current.forEach(clearTimeout);
            ticks.current = [];
        };

        clear();

        /*
         * A choice ends the reveal. A row picked before the stack had finished
         * arriving would otherwise go on being ticked at, one detent at a time,
         * through a hold that is meant to be still.
         */
        if (!open || hidden || holding)
            return;

        for (let row = 1; row < itemCount; row++) {
            ticks.current.push(
                setTimeout(() => feedback("tick"), row * MIN_TAP_SPACING_MS),
            );
        }

        return clear;
    }, [open, hidden, holding, itemCount]);

    /*
     * Held in a variable because the element needs both halves of it: the
     * props, and the prefixed backdrop-filter inside `style`, which has to be
     * merged with the touch-callout rules rather than replaced by them.
     */
    const buttonGlass = glassSurface({ tier: open ? "thick" : "regular", tint });

    /*
     * Buttons here are ker-thunks: a light click as the finger lands, and a
     * deep one as it lets go — which is also when the button acts, the way an
     * iOS button does. Press, and nothing is decided yet; slide off before
     * letting go, and nothing happens at all.
     */
    const pressed = useRef<{ id: string; at: number } | null>(null);

    const press = (id: string) => {
        pressed.current = { id, at: Date.now() };
        feedback("press");
    };

    /*
     * Where the press started, if the release counts: on the same control it
     * began on, and on it or near it — within a thumb's drift, as iOS allows —
     * rather than somewhere the finger has wandered off to.
     */
    const release = (id: string, e: React.PointerEvent): number | null => {
        const p = pressed.current;
        pressed.current = null;

        if (!p || p.id !== id)
            return null;

        // No coordinates to judge by: take the release at its word.
        if (typeof e.clientX !== "number" || typeof e.clientY !== "number")
            return p.at;

        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const within =
            e.clientX >= r.left - RELEASE_SLOP && e.clientX <= r.right + RELEASE_SLOP
            && e.clientY >= r.top - RELEASE_SLOP && e.clientY <= r.bottom + RELEASE_SLOP;

        return within ? p.at : null;
    };

    /*
     * The thunk, held back if the finger was quicker than the engine. A ker
     * and a thunk closer together than the engine can separate run into one
     * tap, and a quick tap is the commonest kind — so the thunk waits out the
     * gap, never the button: what the press does happens on release regardless.
     */
    const thunk = (feel: Feel, pressedAt: number) => {
        const wait = MIN_TAP_SPACING_MS - (Date.now() - pressedAt);

        if (wait > 0)
            setTimeout(() => feedback(feel), wait);
        else
            feedback(feel);
    };

    /*
     * Navigate now, let go later, and go out in a puff of dust.
     *
     * Three beats. The page changes at the moment of the tap, underneath the
     * scrim, so it has done its rendering long before anyone sees it. The
     * chosen row then holds, lit, while everything else recedes. Then it turns
     * to dust from one end to the other while the scrim lifts, so the sparks
     * scatter over the page that was chosen — and the menu closes only once
     * the last of the row itself has gone, leaving the dust to finish alone.
     */
    const choose = useCallback((item: ActionMenuItem) => {
        if (holding) return;

        setChosen({ id: item.id, items, dissolving: false });
        onNavigate(item.id, item.kind);

        hold.current = setTimeout(() => {
            setChosen((c) => c && { ...c, dissolving: true });
            // This opening's row: the last close's may still be on its way out
            undoFizzle.current = fizzle(stack.current?.querySelector(`[data-menu-row="${item.id}"][data-menu-opening="${opening.current}"]`) ?? null);

            hold.current = setTimeout(() => {
                hold.current = null;
                setOpen(false);
                setChosen(null);
            }, DISSOLVE_MS);
        }, CHOICE_HOLD_MS);
    }, [holding, items, onNavigate, setOpen]);

    return (
        <>
            {/*
              * The scrim, which both dims what is behind the stack and gives the
              * glass something with contrast to sit against — over a near-black
              * page the material has almost nothing to refract.
              *
              * Mounted only while open. Left in place at zero opacity it would
              * still cost a full-screen backdrop blur on every frame of every
              * scroll underneath it.
              */}
            <AnimatePresence>
                {open && !effectivelyHidden && (
                    <MotionBox
                        position="fixed"
                        top="0"
                        left="0"
                        width="100vw"
                        height="100vh"
                        zIndex="999999999"
                        backdropFilter="blur(18px) saturate(120%)"
                        style={{ WebkitBackdropFilter: "blur(18px) saturate(120%)" }}
                        /*
                         * Darker while a choice is held, so the page recedes
                         * along with the rows and the one lit thing left on
                         * screen is the answer.
                         */
                        initial={{ opacity: 0, backgroundColor: "rgba(8,8,10,0.44)" }}
                        /*
                         * And lifting as the row dissolves, over the whole of
                         * the dissolve, so the page arrives under the dust
                         * rather than after it.
                         */
                        animate={{
                            opacity: dissolving ? 0 : 1,
                            backgroundColor: holding ? "rgba(8,8,10,0.72)" : "rgba(8,8,10,0.44)",
                        }}
                        exit={{ opacity: 0 }}
                        transition={
                            dissolving
                                ? { duration: DISSOLVE_MS / 1000, ease: "easeInOut" }
                                : { duration: 0.22, ease: "easeOut" }
                        }
                        onPointerDown={() => {
                            // The hold is short and already on its way out.
                            if (holding) return;
                            feedback("close");
                            setOpen(false);
                        }}
                    />
                )}
            </AnimatePresence>

            {/*
              * The top card: slides down from above the screen as the menu
              * opens, and back up as it closes — or as a row is chosen, with
              * the other rows, rather than hanging over the dissolve.
              */}
            <AnimatePresence>
                {open && !holding && !effectivelyHidden && topCard && (
                    <MotionBox
                        key="top-card"
                        position="fixed"
                        top="calc(var(--safe-area-inset-top, 0px) + 14px)"
                        left="20px"
                        right="20px"
                        zIndex="1000000000"
                        pointerEvents="none"
                        initial={{ y: "-130%", opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: "-130%", opacity: 0, transition: { duration: 0.22, ease: "easeIn" } }}
                        transition={SPRING}
                    >
                        {/*
                          * Bare, not in a pane of its own: it sits on the
                          * blurred scrim the way it sat on the old page
                          * switcher's backdrop, part of the page rather than
                          * another floating thing on top of it.
                          */}
                        {topCard}
                    </MotionBox>
                )}
            </AnimatePresence>

            <Box
                ref={stack}
                position="fixed"
                right="20px"
                bottom="calc(var(--safe-area-inset-bottom, 0px) + 22px)"
                zIndex="1000000000"
                display="flex"
                flexDirection="column"
                alignItems="flex-end"
                gap={`${ITEM_GAP}px`}
                opacity={effectivelyHidden ? 0 : 1}
                visibility={effectivelyHidden ? "hidden" : "visible"}
                transition="opacity .2s"
                // A second choice, or a close, mid-hold would only fight the first.
                pointerEvents={effectivelyHidden || holding ? "none" : "all"}
            >
                {/*
                  * The page's pinned action, floating above the button while the
                  * menu is shut. Out of the flow, so it takes no room from the
                  * stack, and gone before the first row arrives where it sits.
                  */}
                <AnimatePresence>
                    {!open && pin && (
                        <MotionBox
                            key={`pinned-${pin.id}`}
                            data-pinned="true"
                            position="absolute"
                            right="0"
                            bottom={`${BUTTON_SIZE + ITEM_GAP}px`}
                            variants={PINNED_MOVE}
                            initial="away"
                            animate="here"
                            exit="leaving"
                            role="button"
                            aria-label={pin.label}
                            tabIndex={0}
                            onKeyDown={onActivateKey(() => pin.run())}
                            onPointerDown={(e: React.PointerEvent) => {
                                e.stopPropagation();
                                press(`pinned:${pin.id}`);
                            }}
                            onPointerUp={(e: React.PointerEvent) => {
                                e.stopPropagation();
                                const at = release(`pinned:${pin.id}`, e);
                                if (at === null) return;
                                // Straight there: a pinned action is a shortcut, not a menu choice.
                                thunk("choose", at);
                                pin.run();
                            }}
                            onPointerCancel={() => { pressed.current = null; }}
                        >
                            {/*
                              * Over a companion button, the pill spans the pair
                              * exactly, so the three share their outer edges as
                              * one block. There's no room for the glyph at that
                              * width, and the label says enough on its own.
                              */}
                            <MotionBox
                                variants={GLASS_FADE}
                                {...motionGlass({ tier: "regular", radius: "9999px", tint })}
                                position="relative"
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                                height={`${CONTROL_SIZE}px`}
                                width={beside ? `${PAIR_WIDTH}px` : undefined}
                                paddingX={beside ? 0 : "20px"}
                                gap="10px"
                                // On a motion element `transition` is framer's; the CSS one goes through sx.
                                sx={{ transition: `transform .12s, filter .12s, ${GLASS_TRANSITION}` }}
                                _active={glassPress}
                            >
                                {halo && <GlassHalo colours={halo} />}
                                <Text
                                    fontFamily="Inter"
                                    fontWeight="semibold"
                                    fontSize={beside ? "12px" : "14px"}
                                    letterSpacing={beside ? "0.1em" : "0.12em"}
                                    textTransform="uppercase"
                                    color={ink}
                                    whiteSpace="nowrap"
                                    userSelect="none"
                                >
                                    {pin.label}
                                </Text>
                                {!beside && <PinIcon size={18} color={ink} strokeWidth={2.4} />}
                            </MotionBox>
                        </MotionBox>
                    )}
                </AnimatePresence>

                {/*
                  * The companion button, to the left of the menu button and
                  * level with it — under the pinned action, when there is one.
                  */}
                <AnimatePresence>
                    {!open && beside && (
                        <MotionBox
                            key={`beside-${beside.id}`}
                            data-beside="true"
                            position="absolute"
                            right={`${BUTTON_SIZE + BESIDE_GAP}px`}
                            bottom={`${(BUTTON_SIZE - BESIDE_SIZE) / 2}px`}
                            variants={BESIDE_MOVE}
                            initial="away"
                            animate="here"
                            exit="leaving"
                            role="button"
                            aria-label={beside.label}
                            tabIndex={0}
                            onKeyDown={onActivateKey(() => beside.run())}
                            onPointerDown={(e: React.PointerEvent) => {
                                e.stopPropagation();
                                press(`beside:${beside.id}`);
                            }}
                            onPointerUp={(e: React.PointerEvent) => {
                                e.stopPropagation();
                                const at = release(`beside:${beside.id}`, e);
                                if (at === null) return;
                                thunk("choose", at);
                                beside.run();
                            }}
                            onPointerCancel={() => { pressed.current = null; }}
                        >
                            <MotionBox
                                variants={GLASS_FADE}
                                {...motionGlass({ tier: "regular", tint })}
                                position="relative"
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                                width={`${BESIDE_SIZE}px`}
                                height={`${BESIDE_SIZE}px`}
                                sx={{ transition: `transform .12s, filter .12s, ${GLASS_TRANSITION}` }}
                                _active={glassPress}
                            >
                                {halo && <GlassHalo colours={halo} />}
                                <BesideIcon size={21} color={ink} strokeWidth={2} />
                            </MotionBox>
                        </MotionBox>
                    )}
                </AnimatePresence>

                {/*
                  * popLayout: a row on its way out is taken out of the column's
                  * flow, held exactly where it was. Every opening has rows of
                  * its own, so a reopen mid-close has two sets in the column
                  * at once; in the flow, the old set was shoved up the screen
                  * by the new one arriving under it, mid-fall.
                  */}
                <AnimatePresence mode="popLayout">
                    {open && items.map((item, i) => {
                        const Icon = item.icon;

                        /*
                         * Counted from the bottom of the list rather than the
                         * top, so the reveal runs upwards away from the thumb
                         * and the dismissal runs back down into it.
                         */
                        const fromBottom = items.length - 1 - i;
                        const arrive = open ? fromBottom * STAGGER : 0;
                        const slam = {
                            duration: SLAM_S,
                            times: SLAM_TIMES,
                            ease: SLAM_EASE,
                            delay: arrive,
                        };

                        /*
                         * During a hold the chosen row lifts a touch and the
                         * rest fall away and blur — by transform, so nothing
                         * reflows and the chosen row stays put.
                         */
                        const isChosen = holding && item.id === chosen.id;
                        const state = !holding ? "open" : isChosen ? "chosen" : "recede";
                        const move = state === "open"
                            ? { ...SPRING, delay: arrive }
                            : state === "chosen" ? SPRING : RECEDE;

                        /*
                         * AnimatePresence plays the exit from the last props a
                         * row was rendered with, which were set while the menu
                         * was still open — so the wave position and whether a
                         * choice was held are both still to hand here.
                         */
                        const exit = rowExit(fromBottom, holding);

                        return (
                            <MotionBox
                                key={`${opening.current}:${item.id}`}
                                // How the dissolve finds the row it is to take apart.
                                data-menu-row={item.id}
                                data-menu-opening={opening.current}
                                display="flex"
                                alignItems="center"
                                gap="14px"
                                // The row only moves; see ROW_MOVE_KEYS
                                initial={{ y: 14, scale: 0.72 }}
                                animate={
                                    state === "open" ? { y: 0, scale: 1 }
                                        : state === "chosen" ? { y: 0, scale: 1.05 }
                                            : part(RECEDE_TARGET, ROW_MOVE_KEYS)
                                }
                                exit={part(exit, ROW_MOVE_KEYS)}
                                transition={move}
                                role="button"
                                aria-label={item.label}
                                tabIndex={0}
                                onKeyDown={onActivateKey(() => {
                                    if (!holding)
                                        choose(item);
                                })}
                                /*
                                 * Stopped here so the touch does not carry on
                                 * to the scrim underneath, which would close
                                 * the menu at the same moment as choosing from
                                 * it. The choice itself waits for the release.
                                 */
                                onPointerDown={(e: React.PointerEvent) => {
                                    e.stopPropagation();
                                    if (holding) return;
                                    press(item.id);
                                }}
                                onPointerUp={(e: React.PointerEvent) => {
                                    e.stopPropagation();
                                    const at = release(item.id, e);
                                    if (at === null || holding) return;
                                    thunk("choose", at);
                                    choose(item);
                                }}
                                onPointerCancel={() => { pressed.current = null; }}
                            >
                                {/* The label's fade and blur, in a wrapper that holds no glass */}
                                <MotionBox
                                    initial={{ opacity: 0 }}
                                    animate={state === "recede" ? part(RECEDE_TARGET, ROW_FADE_KEYS) : { opacity: 1 }}
                                    exit={part(exit, ROW_FADE_KEYS)}
                                    transition={move}
                                >
                                    <MotionText
                                        // How the dissolve finds the words it is to take apart
                                        data-fizzle="label"
                                        initial={SLAM_LABEL_REST}
                                        animate={SLAM_LABEL}
                                        transition={slam}
                                        fontFamily="Inter"
                                        fontWeight="semibold"
                                        fontSize="15px"
                                        letterSpacing="0.14em"
                                        textTransform="uppercase"
                                        color={ink}
                                        whiteSpace="nowrap"
                                        userSelect="none"
                                    >
                                        {item.label}
                                    </MotionText>
                                </MotionBox>
                                {/* The glass fades itself, and keeps blurring what is behind it */}
                                <MotionBox
                                    data-fizzle="button"
                                    {...motionGlass({ tier: "regular", tint })}
                                    position="relative"
                                    display="flex"
                                    alignItems="center"
                                    justifyContent="center"
                                    width={`${ITEM_SIZE}px`}
                                    height={`${ITEM_SIZE}px`}
                                    flexShrink={0}
                                    sx={{ transition: `transform .12s, filter .12s, ${GLASS_TRANSITION}` }}
                                    _active={glassPress}
                                    initial={{ opacity: 0 }}
                                    /*
                                     * The chosen row's glass fades while its
                                     * label turns to dust, on the dissolve's
                                     * clock. Here rather than in the dissolve:
                                     * framer owns this element's opacity, and a
                                     * style set behind its back does nothing.
                                     */
                                    animate={
                                        isChosen && dissolving
                                            ? { opacity: 0, transition: { duration: BUTTON_FADE_MS / 1000, ease: "easeIn" } }
                                            : { opacity: state === "recede" ? 0 : 1 }
                                    }
                                    // Already gone by then, and it stays gone
                                    exit={isChosen && dissolving
                                        ? { opacity: 0, transition: { duration: 0 } }
                                        : part(exit, GLASS_FADE_KEYS)}
                                    transition={move}
                                >
                                    <Icon size={21} color={ink} strokeWidth={2} />
                                    {/* Over the icon too, so it dims and flares with its glass. */}
                                    <MotionBox
                                        position="absolute"
                                        inset="0"
                                        borderRadius="inherit"
                                        pointerEvents="none"
                                        background="rgba(0,0,0,0.55)"
                                        initial={{ opacity: 1 }}
                                        animate={SLAM_SHADE}
                                        transition={slam}
                                    />
                                    <MotionBox
                                        position="absolute"
                                        inset="0"
                                        borderRadius="inherit"
                                        pointerEvents="none"
                                        background="rgba(255,255,255,0.28)"
                                        initial={{ opacity: 0 }}
                                        animate={SLAM_WASH}
                                        transition={slam}
                                    />
                                </MotionBox>
                            </MotionBox>
                        );
                    })}
                </AnimatePresence>

                {/*
                  * The button itself: a menu on a page, the cross that puts the
                  * menu away, and the way back from a sub-page — one drawing in
                  * three poses. See GLYPH_TOP for how the strokes move.
                  */}
                <Center
                    {...buttonGlass}
                    position="relative"
                    width={`${BUTTON_SIZE}px`}
                    height={`${BUTTON_SIZE}px`}
                    flexShrink={0}
                    transition={`transform .14s, filter .14s, opacity .18s, ${GLASS_TRANSITION}`}
                    // Gone with the other rows while a choice is held.
                    opacity={holding ? 0 : 1}
                    _active={glassPress}
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        // The ker: the finger has landed, and nothing is decided.
                        press("button");
                    }}
                    onPointerUp={(e) => {
                        e.stopPropagation();
                        const at = release("button", e);
                        if (at === null) return;

                        // On a sub-page: back, with the lighter thunk of undoing.
                        if (glyph === "back" && onBack) {
                            thunk("close", at);
                            onBack();
                            return;
                        }

                        // The thunk, and the button acting on it.
                        thunk(open ? "close" : "open", at);
                        setOpen(!open);
                    }}
                    onPointerCancel={() => { pressed.current = null; }}
                    // Hidden while a choice is held, and out of reach: closing
                    // now would cut the chosen row off before it dissolves.
                    tabIndex={holding ? -1 : 0}
                    onKeyDown={onActivateKey(() => {
                        if (holding) return;

                        if (glyph === "back" && onBack) {
                            onBack();

                            return;
                        }

                        setOpen(!open);
                    })}
                    aria-label={glyph === "cross" ? "Close menu" : glyph === "back" ? "Back" : "Open menu"}
                    aria-expanded={glyph === "back" ? undefined : open}
                    role="button"
                    style={{
                        ...buttonGlass.style,
                        WebkitTouchCallout: "none",
                        WebkitTapHighlightColor: "transparent",
                    }}
                >
                    {halo && <GlassHalo colours={halo} />}
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={ink}
                        strokeWidth={2.2}
                        style={{ transition: "stroke .45s ease" }}
                        strokeLinecap="round"
                        aria-hidden
                    >
                        <motion.line
                            initial={false}
                            animate={GLYPH_TOP[glyph]}
                            transition={SPRING}
                        />
                        <motion.line
                            initial={false}
                            animate={GLYPH_MIDDLE[glyph]}
                            transition={SPRING}
                        />
                        <motion.line
                            initial={false}
                            animate={GLYPH_BOTTOM[glyph]}
                            transition={SPRING}
                        />
                    </svg>
                </Center>
            </Box>
        </>
    );
}
