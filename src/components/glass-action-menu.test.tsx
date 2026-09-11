import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * The ratchet, which is the one part of the haptics that cannot be checked by
 * feel on a simulator and cannot be seen at all.
 *
 * Two things are worth pinning down. That the rhythm is the animation's, one
 * tap per row and none for the row that arrives with the press itself; and
 * that a menu dismissed halfway through stops ticking — a run of taps outlives
 * the gesture that scheduled it, so without cancellation it would go on
 * tapping at somebody after the menu had gone.
 */

const feedback = vi.fn();

vi.mock("@/lib/native-haptics", () => ({
    feedback: (feel: string) => feedback(feel),
    MIN_TAP_SPACING_MS: 70,
}));

/** The dust draws on a canvas jsdom does not have; what matters here is when it is asked for. */
const fizzle = vi.fn();

vi.mock("@/lib/fizzle", () => ({
    fizzle: (el: unknown) => fizzle(el),
    DISSOLVE_MS: 560,
}));

/*
 * Framer drives its own clock off rAF, which fake timers stop; the animation is
 * not what is under test here, so the motion components stand in as plain divs
 * and AnimatePresence renders its children as-is.
 */
vi.mock("framer-motion", () => ({
    motion: {
        /** The menu icon's strokes: plain lines, since the morph is not under test. */
        line: (props: any) => <line x1={props.x1} y1={props.y1} x2={props.x2} y2={props.y2} />,
        /*
         * Only the props a test could care about are forwarded. Passing the
         * rest through would put Chakra's style props on a bare div, which
         * React warns about at length for every one of them.
         */
        create: () => (props: any) => (
            <div
                role={props.role}
                aria-label={props["aria-label"]}
                data-menu-row={props["data-menu-row"]}
                data-pinned={props["data-pinned"]}
                data-beside={props["data-beside"]}
                onPointerDown={props.onPointerDown}
                onPointerUp={props.onPointerUp}
                onPointerCancel={props.onPointerCancel}
                tabIndex={props.tabIndex}
                onKeyDown={props.onKeyDown}
            >
                {props.children}
            </div>
        ),
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import GlassActionMenu, {
    ACTION_MENU_ITEMS,
    CHOICE_HOLD_MS,
    CLOSE_BASELINE,
    CLOSE_BASELINE_S,
    CLOSE_STAGGER_S,
    rowExit,
} from "./glass-action-menu";
import { DISSOLVE_MS } from "@/lib/fizzle";

const SPACING = 70;

/** When the menu lets go of a choice: the hold, then the dissolve. */
const RELEASE_MS = CHOICE_HOLD_MS + DISSOLVE_MS;

/** The rows on screen on a page: every item, less the page's own entry. */
const rowsOn = (page: string) =>
    ACTION_MENU_ITEMS.filter(v => !(v.kind === "page" && v.id === page)).length;

/*
 * The controls are divs acting as buttons, so that they can carry the
 * ker-thunk; a keyboard has to reach them too. Enter and Space do what a tap
 * does, haptics aside - and on a sub-page the menu button is the only way back.
 */
describe("from a keyboard", () => {
    it("opens the menu with Enter, and goes back with Space on a sub-page", () => {
        const setOpen = vi.fn();
        const onBack = vi.fn();
        const { rerender } = render(<GlassActionMenu open={false} setOpen={setOpen} onNavigate={vi.fn()} currentPage="friends" />);

        fireEvent.keyDown(screen.getByLabelText("Open menu"), { key: "Enter" });
        expect(setOpen).toHaveBeenCalledWith(true);

        rerender(<GlassActionMenu open={false} setOpen={setOpen} onNavigate={vi.fn()} onBack={onBack} currentPage="add-friends" />);

        fireEvent.keyDown(screen.getByLabelText("Back"), { key: " " });
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("chooses a row with Enter", () => {
        const onNavigate = vi.fn();

        render(<GlassActionMenu open setOpen={vi.fn()} onNavigate={onNavigate} currentPage="friends" />);

        fireEvent.keyDown(screen.getByLabelText("Leaderboard"), { key: "Enter" });
        expect(onNavigate).toHaveBeenCalledWith("leaderboard", "page");
    });

    it("leaves every other key alone", () => {
        const setOpen = vi.fn();

        render(<GlassActionMenu open={false} setOpen={setOpen} onNavigate={vi.fn()} currentPage="friends" />);

        fireEvent.keyDown(screen.getByLabelText("Open menu"), { key: "a" });
        expect(setOpen).not.toHaveBeenCalled();
    });
});

const ROWS_ON_FRIENDS = rowsOn("friends");

function renderMenu(open: boolean, extra: Record<string, unknown> = {}) {
    return render(
        <GlassActionMenu
            open={open}
            setOpen={() => {}}
            currentPage="friends"
            onNavigate={() => {}}
            {...extra}
        />,
    );
}

beforeEach(() => {
    vi.useFakeTimers();
    feedback.mockClear();
    fizzle.mockClear();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("the ratchet", () => {
    it("does not tick while the menu is shut", () => {
        renderMenu(false);

        vi.advanceTimersByTime(SPACING * 20);

        expect(feedback).not.toHaveBeenCalled();
    });

    it("gives every row a tap but the one that arrives with the press", () => {
        renderMenu(true);

        vi.advanceTimersByTime(SPACING * 20);

        expect(feedback.mock.calls).toEqual(
            new Array(ROWS_ON_FRIENDS - 1).fill(["tick"]),
        );
    });

    it("spaces them by the rhythm of the reveal", () => {
        renderMenu(true);

        // Nothing yet: the first row's own arrival is the press.
        expect(feedback).toHaveBeenCalledTimes(0);

        for (let row = 1; row < ROWS_ON_FRIENDS; row++) {
            // A moment before the row lands, its tap has not been felt.
            vi.advanceTimersByTime(SPACING - 1);
            expect(feedback).toHaveBeenCalledTimes(row - 1);

            vi.advanceTimersByTime(1);
            expect(feedback).toHaveBeenCalledTimes(row);
        }
    });

    it("stops ticking when the menu is dismissed midway", () => {
        const { rerender } = renderMenu(true);

        // Two rows in, with three still to come.
        vi.advanceTimersByTime(SPACING * 2);
        expect(feedback).toHaveBeenCalledTimes(2);

        rerender(
            <GlassActionMenu
                open={false}
                setOpen={() => {}}
                currentPage="friends"
                onNavigate={() => {}}
            />,
        );

        vi.advanceTimersByTime(SPACING * 20);

        expect(feedback).toHaveBeenCalledTimes(2);
    });

    it("stops ticking when the menu is taken away midway", () => {
        const { unmount } = renderMenu(true);

        vi.advanceTimersByTime(SPACING * 2);
        expect(feedback).toHaveBeenCalledTimes(2);

        unmount();
        vi.advanceTimersByTime(SPACING * 20);

        expect(feedback).toHaveBeenCalledTimes(2);
    });

    it("counts the rows actually on screen, not every row there is", () => {
        // Each page drops its own row; the ratchet has to follow.
        renderMenu(true, { currentPage: "leaderboard" });

        vi.advanceTimersByTime(SPACING * 20);

        expect(feedback).toHaveBeenCalledTimes(rowsOn("leaderboard") - 1);
    });

    it("drops a page's own row but never an action's", () => {
        // A sub-page's id matches an action, and actions stay on offer.
        renderMenu(true, { currentPage: "add-friends" });

        vi.advanceTimersByTime(SPACING * 20);

        expect(feedback).toHaveBeenCalledTimes(ACTION_MENU_ITEMS.length - 1);
    });
});

/**
 * The beat after a choice: the row chosen stays on screen while everything
 * else recedes, and only then does the menu let go.
 *
 * The parts that can go wrong without anyone seeing are about timing and
 * membership — navigating late, closing early, or the stack rearranging itself
 * under the row that is meant to be holding still — so that is what these pin.
 */
describe("the hold after a choice", () => {
    function setup(page = "leaderboard") {
        const setOpen = vi.fn();
        const onNavigate = vi.fn();
        const props = { open: true, setOpen, onNavigate, currentPage: page };
        const view = render(<GlassActionMenu {...props} />);

        const rerender = (over: Record<string, unknown>) =>
            view.rerender(<GlassActionMenu {...props} {...over} />);

        return { setOpen, onNavigate, rerender };
    }

    const tap = (label: string) => {
        const el = screen.getByLabelText(label);
        fireEvent.pointerDown(el);
        fireEvent.pointerUp(el);
    };

    it("navigates at once, and lets go only after the hold and the dissolve", () => {
        const { setOpen, onNavigate } = setup();

        tap("Friends");

        expect(onNavigate).toHaveBeenCalledWith("friends", "page");
        expect(setOpen).not.toHaveBeenCalled();

        vi.advanceTimersByTime(RELEASE_MS - 1);
        expect(setOpen).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(setOpen).toHaveBeenCalledWith(false);
    });

    it("keeps the chosen row on screen after it has become the current page", () => {
        const { rerender } = setup("leaderboard");

        tap("Friends");

        // The shell has navigated: Friends is now where we are.
        rerender({ currentPage: "friends" });

        expect(screen.queryByLabelText("Friends")).not.toBeNull();
        // And the page just left does not put its row back mid-hold.
        expect(screen.queryByLabelText("Leaderboard")).toBeNull();
    });

    it("holds even when the choice sends the shell to a sub-page", () => {
        const { setOpen, rerender } = setup();

        tap("Add Friends");

        // Sub-pages hide the menu; that must wait until the beat is over.
        rerender({ hidden: true });
        vi.advanceTimersByTime(RELEASE_MS - 1);
        expect(setOpen).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(setOpen).toHaveBeenCalledWith(false);
    });

    it("takes the first choice and ignores the rest", () => {
        const { onNavigate } = setup();

        tap("Friends");
        tap("Passport");

        expect(onNavigate).toHaveBeenCalledTimes(1);
        expect(onNavigate).toHaveBeenCalledWith("friends", "page");
    });

    it("stops the ratchet when a row is chosen before the stack has arrived", () => {
        setup();

        vi.advanceTimersByTime(SPACING);
        tap("Friends");
        vi.advanceTimersByTime(SPACING * 20);

        const ticks = feedback.mock.calls.filter(([feel]) => feel === "tick");
        expect(ticks).toHaveLength(1);
    });
});

describe("the dissolve at the end of the hold", () => {
    it("turns the chosen row to dust once the beat is over, and not before", () => {
        render(<GlassActionMenu open setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="leaderboard" />);

        fireEvent.pointerDown(screen.getByLabelText("Friends"));
        fireEvent.pointerUp(screen.getByLabelText("Friends"));

        vi.advanceTimersByTime(CHOICE_HOLD_MS - 1);
        expect(fizzle).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(fizzle).toHaveBeenCalledTimes(1);

        const row = fizzle.mock.calls[0][0] as HTMLElement;
        expect(row.getAttribute("data-menu-row")).toBe("friends");
    });

    it("puts the chosen row back when the menu next opens", () => {
        /*
         * The dissolve hides the row's label and button itself. Reopened before
         * framer has finished removing the old rows, the menu gets that same row
         * back rather than a new one, which showed as an empty slot — so opening
         * has to undo what the dissolve did.
         */
        const undo = vi.fn();
        fizzle.mockReturnValueOnce(undo);

        const props = { setOpen: vi.fn(), onNavigate: vi.fn(), currentPage: "leaderboard" };
        const view = render(<GlassActionMenu open {...props} />);

        fireEvent.pointerDown(screen.getByLabelText("Friends"));
        fireEvent.pointerUp(screen.getByLabelText("Friends"));
        vi.advanceTimersByTime(RELEASE_MS);

        // Open through the dust, then shut: nothing is put back mid-dissolve.
        expect(undo).not.toHaveBeenCalled();
        view.rerender(<GlassActionMenu open={false} {...props} />);
        expect(undo).not.toHaveBeenCalled();

        view.rerender(<GlassActionMenu open {...props} />);
        expect(undo).toHaveBeenCalledTimes(1);

        // Once is enough: the opening after that has nothing left to undo.
        view.rerender(<GlassActionMenu open={false} {...props} />);
        view.rerender(<GlassActionMenu open {...props} />);
        expect(undo).toHaveBeenCalledTimes(1);
    });

    it("dissolves nothing if the menu is shut from outside during the hold", () => {
        const props = { setOpen: vi.fn(), onNavigate: vi.fn(), currentPage: "leaderboard" };
        const { rerender } = render(<GlassActionMenu open {...props} />);

        fireEvent.pointerDown(screen.getByLabelText("Friends"));
        fireEvent.pointerUp(screen.getByLabelText("Friends"));
        rerender(<GlassActionMenu open={false} {...props} />);

        vi.advanceTimersByTime(RELEASE_MS * 2);
        expect(fizzle).not.toHaveBeenCalled();
    });
});

/**
 * Closing with the cross, or by tapping away.
 *
 * The rows leave on a wave, and on its own the wave left the last of them at
 * full strength while they waited their turn. So every row drops to a
 * baseline the moment the menu is told to close, and the wave takes it from
 * there. These pin the timing that makes that true, and the one case where a
 * baseline would be wrong.
 */
describe("closing without a choice", () => {
    /** The exit is typed as framer's loose target; these tests read its opacity curve. */
    const opacityOf = (exit: ReturnType<typeof rowExit>) =>
        exit as unknown as {
            opacity: (number | null)[];
            transition: { opacity: { times: number[]; duration: number } };
        };

    it("drops every row to the baseline at once, however far up the wave it is", () => {
        for (const fromBottom of [0, 1, 3, 5]) {
            const exit = opacityOf(rowExit(fromBottom, false));
            const { times, duration } = exit.transition.opacity;

            expect(exit.opacity[1]).toBe(CLOSE_BASELINE);
            expect(times[1] * duration).toBeCloseTo(CLOSE_BASELINE_S);
        }
    });

    it("holds a row at the baseline until its turn, then takes it out", () => {
        const exit = opacityOf(rowExit(4, false));
        const { times, duration } = exit.transition.opacity;

        expect(exit.opacity[2]).toBe(CLOSE_BASELINE);
        expect(times[2] * duration).toBeCloseTo(4 * CLOSE_STAGGER_S);
        expect(exit.opacity.at(-1)).toBe(0);
        expect([...times].sort((a, b) => a - b)).toEqual(times);
    });

    it("is gone quickly: even the furthest row is out inside 0.4s", () => {
        // It used to take the arrival's own wave and a spring's tail — two
        // thirds of a second for the last row. Leaving should cost less.
        const furthest = opacityOf(rowExit(ACTION_MENU_ITEMS.length - 1, false));

        expect(furthest.transition.opacity.duration).toBeLessThan(0.4);
    });

    it("falls and blurs on the way out", () => {
        const exit = rowExit(2, false) as unknown as { filter: string[]; y: number };

        expect(exit.y).toBeGreaterThan(0);
        expect(exit.filter[0]).toBe("blur(0px)");
        expect(exit.filter.at(-1)).toMatch(/^blur\([1-9]/);
    });

    it("never lifts a row back up after a choice", () => {
        // The hold has already faded the others to nothing; a baseline on the
        // way out would bring them back to 40% for a moment.
        expect(rowExit(3, true)).toEqual({ opacity: 0, transition: { duration: 0.2 } });
    });
});

/**
 * The ker-thunk: a light click as a finger lands on a button, and a deep one
 * as it lets go — which is also when the button acts.
 *
 * Pinned here because neither half can be felt on a simulator, and the parts
 * that would go wrong quietly are about order and timing: the button acting on
 * the press instead of the release, a thunk crowding the ker so the two feel
 * like one, or a finger that slid off still being taken as a tap.
 */
describe("the ker-thunk", () => {
    const feels = () => feedback.mock.calls.map(([feel]) => feel).filter(f => f !== "tick");

    /*
     * jsdom has no PointerEvent, and without one the testing library fires a
     * bare Event that carries no coordinates — which the release check accepts,
     * since it cannot judge a release it cannot place. A real touch always has
     * coordinates, so these tests get a PointerEvent that does too, built on
     * MouseEvent, rather than the check being loosened to suit the harness.
     */
    beforeEach(() => {
        vi.stubGlobal("PointerEvent", class extends MouseEvent {
            pointerId = 1;
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("kers on the press and decides nothing", () => {
        const setOpen = vi.fn();
        render(<GlassActionMenu open={false} setOpen={setOpen} onNavigate={vi.fn()} currentPage="friends" />);

        fireEvent.pointerDown(screen.getByLabelText("Open menu"));

        expect(feels()).toEqual(["press"]);
        expect(setOpen).not.toHaveBeenCalled();
    });

    it("acts on the release, and thunks — held back from the ker on a quick tap", () => {
        const setOpen = vi.fn();
        render(<GlassActionMenu open={false} setOpen={setOpen} onNavigate={vi.fn()} currentPage="friends" />);

        const button = screen.getByLabelText("Open menu");
        fireEvent.pointerDown(button);
        fireEvent.pointerUp(button);

        // The button acts at once; only the thunk waits out the gap.
        expect(setOpen).toHaveBeenCalledWith(true);
        expect(feels()).toEqual(["press"]);

        vi.advanceTimersByTime(SPACING - 1);
        expect(feels()).toEqual(["press"]);

        vi.advanceTimersByTime(1);
        expect(feels()).toEqual(["press", "open"]);
    });

    it("thunks at once when the press was held longer than the gap", () => {
        render(<GlassActionMenu open={false} setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="friends" />);

        const button = screen.getByLabelText("Open menu");
        fireEvent.pointerDown(button);
        vi.advanceTimersByTime(250);
        fireEvent.pointerUp(button);

        expect(feels()).toEqual(["press", "open"]);
    });

    it("thunks lighter for putting the menu away", () => {
        const setOpen = vi.fn();
        render(<GlassActionMenu open setOpen={setOpen} onNavigate={vi.fn()} currentPage="friends" />);

        const button = screen.getByLabelText("Close menu");
        fireEvent.pointerDown(button);
        vi.advanceTimersByTime(250);
        fireEvent.pointerUp(button);

        expect(setOpen).toHaveBeenCalledWith(false);
        expect(feels()).toEqual(["press", "close"]);
    });

    it("does nothing when the finger slides off before letting go", () => {
        const setOpen = vi.fn();
        render(<GlassActionMenu open={false} setOpen={setOpen} onNavigate={vi.fn()} currentPage="friends" />);

        const button = screen.getByLabelText("Open menu");
        fireEvent.pointerDown(button);
        fireEvent.pointerUp(button, { clientX: 500, clientY: 500 });
        vi.advanceTimersByTime(SPACING * 4);

        expect(setOpen).not.toHaveBeenCalled();
        expect(feels()).toEqual(["press"]);
    });

    it("does nothing when the system takes the touch away", () => {
        const setOpen = vi.fn();
        render(<GlassActionMenu open={false} setOpen={setOpen} onNavigate={vi.fn()} currentPage="friends" />);

        const button = screen.getByLabelText("Open menu");
        fireEvent.pointerDown(button);
        fireEvent.pointerCancel(button);
        fireEvent.pointerUp(button);
        vi.advanceTimersByTime(SPACING * 4);

        expect(setOpen).not.toHaveBeenCalled();
        expect(feels()).toEqual(["press"]);
    });

    it("makes a row a ker-thunk too, choosing only on the release", () => {
        const onNavigate = vi.fn();
        render(<GlassActionMenu open setOpen={vi.fn()} onNavigate={onNavigate} currentPage="leaderboard" />);

        const row = screen.getByLabelText("Friends");
        fireEvent.pointerDown(row);

        expect(onNavigate).not.toHaveBeenCalled();
        expect(feels()).toEqual(["press"]);

        vi.advanceTimersByTime(250);
        fireEvent.pointerUp(row);

        expect(onNavigate).toHaveBeenCalledWith("friends", "page");
        expect(feels()).toEqual(["press", "choose"]);
    });
});

/**
 * The pinned action: on Friends, "Add Friends" floats above the menu button,
 * so the thing the page is for is one tap away.
 *
 * What these pin is that it shows only where it belongs, never alongside the
 * open menu — the two would sit in the same place — and that it is a button
 * like the others, acting on release and going straight where it says.
 */
describe("the pinned action", () => {
    const feels = () => feedback.mock.calls.map(([feel]) => feel).filter(f => f !== "tick");
    const pinnedPill = () => document.querySelector<HTMLElement>("[data-pinned]");

    it("puts Add Friends above the menu button on the Friends page", () => {
        render(<GlassActionMenu open={false} setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="friends" />);

        expect(pinnedPill()?.getAttribute("aria-label")).toBe("Add Friends");
    });

    it("keeps it to the Friends page", () => {
        render(<GlassActionMenu open={false} setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="leaderboard" />);

        expect(pinnedPill()).toBeNull();
    });

    it("gets out of the way while the menu is open", () => {
        const props = { setOpen: vi.fn(), onNavigate: vi.fn(), currentPage: "friends" };
        const { rerender } = render(<GlassActionMenu open={false} {...props} />);
        expect(pinnedPill()).not.toBeNull();

        rerender(<GlassActionMenu open {...props} />);
        expect(pinnedPill()).toBeNull();
    });

    it("is a ker-thunk that goes straight to Add Friends", () => {
        const onNavigate = vi.fn();
        render(<GlassActionMenu open={false} setOpen={vi.fn()} onNavigate={onNavigate} currentPage="friends" />);

        const pill = pinnedPill()!;
        fireEvent.pointerDown(pill);

        expect(onNavigate).not.toHaveBeenCalled();
        expect(feels()).toEqual(["press"]);

        vi.advanceTimersByTime(250);
        fireEvent.pointerUp(pill);

        expect(onNavigate).toHaveBeenCalledWith("add-friends", "action");
        expect(feels()).toEqual(["press", "choose"]);
    });
});

describe("New Playlist, pinned on Playlists", () => {
    it("floats above the menu button on the Playlists page", () => {
        render(<GlassActionMenu open={false} setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="playlists" />);

        expect(document.querySelector("[data-pinned]")?.getAttribute("aria-label")).toBe("New Playlist");
    });
});

/**
 * On a sub-page — Add Friends, New Playlist, Settings, a friend's profile —
 * the button is the way back, and the only one: the title no longer carries a
 * back chevron. These pin that it never behaves as a menu there.
 */
describe("the button on a sub-page", () => {
    const feels = () => feedback.mock.calls.map(([feel]) => feel).filter(f => f !== "tick");

    it("is a back button, not a menu", () => {
        render(<GlassActionMenu open={false} setOpen={vi.fn()} onNavigate={vi.fn()} onBack={vi.fn()} currentPage="add-friends" />);

        expect(screen.getByLabelText("Back")).not.toBeNull();
        expect(screen.queryByLabelText("Open menu")).toBeNull();
    });

    it("goes back on the release, with a ker and the lighter thunk, and never opens the menu", () => {
        const setOpen = vi.fn();
        const onBack = vi.fn();
        render(<GlassActionMenu open={false} setOpen={setOpen} onNavigate={vi.fn()} onBack={onBack} currentPage="create-playlist" />);

        const back = screen.getByLabelText("Back");
        fireEvent.pointerDown(back);

        expect(onBack).not.toHaveBeenCalled();
        expect(feels()).toEqual(["press"]);

        vi.advanceTimersByTime(250);
        fireEvent.pointerUp(back);

        expect(onBack).toHaveBeenCalledTimes(1);
        expect(setOpen).not.toHaveBeenCalled();
        expect(feels()).toEqual(["press", "close"]);
    });

    it("pins nothing above it", () => {
        render(<GlassActionMenu open={false} setOpen={vi.fn()} onNavigate={vi.fn()} onBack={vi.fn()} currentPage="add-friends" />);

        expect(document.querySelector("[data-pinned]")).toBeNull();
    });
});

/**
 * A page can pin an action of its own — the profile pins View Recap, which
 * opens a drawer rather than a page — in place of the one the map would give.
 */
describe("a page's own pinned action", () => {
    const feels = () => feedback.mock.calls.map(([feel]) => feel).filter(f => f !== "tick");
    const pinnedPill = () => document.querySelector<HTMLElement>("[data-pinned]");

    it("floats above the menu button and runs its own action on release", () => {
        const run = vi.fn();
        const onNavigate = vi.fn();
        render(
            <GlassActionMenu
                open={false}
                setOpen={vi.fn()}
                onNavigate={onNavigate}
                currentPage="settings"
                pinned={{ id: "view-recap", label: "View Recap", run }}
            />,
        );

        const pill = pinnedPill()!;
        expect(pill.getAttribute("aria-label")).toBe("View Recap");

        fireEvent.pointerDown(pill);
        vi.advanceTimersByTime(250);
        fireEvent.pointerUp(pill);

        expect(run).toHaveBeenCalledTimes(1);
        expect(onNavigate).not.toHaveBeenCalled();
        expect(feels()).toEqual(["press", "choose"]);
    });

    it("takes the place of the one the page would otherwise be given", () => {
        render(
            <GlassActionMenu
                open={false}
                setOpen={vi.fn()}
                onNavigate={vi.fn()}
                currentPage="friends"
                pinned={{ id: "view-recap", label: "View Recap", run: vi.fn() }}
            />,
        );

        expect(pinnedPill()?.getAttribute("aria-label")).toBe("View Recap");
    });

    it("pins nothing on the profile when there is no recap to view", () => {
        render(<GlassActionMenu open={false} setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="settings" />);

        expect(pinnedPill()).toBeNull();
    });
});

/**
 * What you are playing, dropped in from the top while the menu is open.
 *
 * Pinned here: it is there only while the menu is, and it clears the moment a
 * row is chosen, with the other rows, rather than hanging over the dissolve.
 */
describe("your now playing, from the top", () => {
    const card = () => screen.queryByTestId("now-playing");
    const nowPlaying = <div data-testid="now-playing" />;

    it("drops in while the menu is open", () => {
        render(<GlassActionMenu open setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="friends" topCard={nowPlaying} />);

        expect(card()).not.toBeNull();
    });

    it("is not there while the menu is shut", () => {
        render(<GlassActionMenu open={false} setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="friends" topCard={nowPlaying} />);

        expect(card()).toBeNull();
    });

    it("clears away as soon as a row is chosen", () => {
        render(<GlassActionMenu open setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="leaderboard" topCard={nowPlaying} />);
        expect(card()).not.toBeNull();

        const row = screen.getByLabelText("Friends");
        fireEvent.pointerDown(row);
        fireEvent.pointerUp(row);

        expect(card()).toBeNull();
    });
});

/**
 * On a song's profile, the floating controls catch the wash's colours as a
 * halo along their top edge. Only the floating ones — the rows of the open
 * stack are transient, and a halo on each would be six things turning at once.
 */
describe("the halo from the page's song", () => {
    const halos = () => document.querySelectorAll("[data-halo]").length;
    const song = ["#ff6a3d", "#ffd23d", "#3dd2ff"];

    it("rings the menu button and the pinned action when the page has a song's colours", () => {
        render(
            <GlassActionMenu
                open={false}
                setOpen={vi.fn()}
                onNavigate={vi.fn()}
                currentPage="settings"
                glow={song}
                pinned={{ id: "view-recap", label: "View Recap", run: vi.fn() }}
            />,
        );

        expect(halos()).toBe(2);
    });

    it("stays off the rows of the open stack", () => {
        render(<GlassActionMenu open setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="settings" glow={song} />);

        // The button alone: the rows are up, the pinned action has gone.
        expect(halos()).toBe(1);
    });

    it("is not there without a song's colours", () => {
        render(<GlassActionMenu open={false} setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="friends" />);

        expect(halos()).toBe(0);
    });

    it("needs more than one colour to make a halo of", () => {
        render(<GlassActionMenu open={false} setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="settings" glow={["#ff6a3d"]} />);

        expect(halos()).toBe(0);
    });
});

/**
 * On your profile, settings sits beside the menu button, where the cog in the
 * profile's header used to be. A floating control like the pinned action: there
 * while the menu is shut, away while it is open, and a ker-thunk.
 */
describe("the button beside the menu", () => {
    const feels = () => feedback.mock.calls.map(([feel]) => feel).filter(f => f !== "tick");
    const besideButton = () => document.querySelector<HTMLElement>("[data-beside]");
    const settings = (run = vi.fn()) => ({ id: "settings", label: "Settings", run });

    it("sits beside the menu button while the menu is shut", () => {
        render(<GlassActionMenu open={false} setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="settings" beside={settings()} />);

        expect(besideButton()?.getAttribute("aria-label")).toBe("Settings");
    });

    it("gets out of the way while the menu is open", () => {
        const props = { setOpen: vi.fn(), onNavigate: vi.fn(), currentPage: "settings", beside: settings() };
        const { rerender } = render(<GlassActionMenu open={false} {...props} />);
        expect(besideButton()).not.toBeNull();

        rerender(<GlassActionMenu open {...props} />);
        expect(besideButton()).toBeNull();
    });

    it("is a ker-thunk that runs its action on release", () => {
        const run = vi.fn();
        render(<GlassActionMenu open={false} setOpen={vi.fn()} onNavigate={vi.fn()} currentPage="settings" beside={settings(run)} />);

        const button = besideButton()!;
        fireEvent.pointerDown(button);
        expect(run).not.toHaveBeenCalled();

        vi.advanceTimersByTime(250);
        fireEvent.pointerUp(button);

        expect(run).toHaveBeenCalledTimes(1);
        expect(feels()).toEqual(["press", "choose"]);
    });

    it("wears the halo with the other floating controls", () => {
        render(
            <GlassActionMenu
                open={false}
                setOpen={vi.fn()}
                onNavigate={vi.fn()}
                currentPage="settings"
                glow={["#1b2a5c", "#9ce3f7"]}
                pinned={{ id: "view-recap", label: "View Recap", run: vi.fn() }}
                beside={settings()}
            />,
        );

        expect(document.querySelectorAll("[data-halo]").length).toBe(3);
    });
});
