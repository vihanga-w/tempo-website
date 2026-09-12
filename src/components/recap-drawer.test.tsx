import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import RecapDrawer, { Recap } from "./recap-drawer";
import type User from "@/lib/usrlib";

/**
 * Closing a recap.
 *
 * The drawer covers the whole interface, nothing behind it takes a tap, and the
 * shell opens it again for any recap the server still calls unseen - every
 * thirty seconds, and at every launch, since a new daily recap is published
 * each morning. So the close button is the only way out, and what it has to do
 * is put away everything on screen and tell the shell, whatever the server
 * makes of the marks it sends.
 */
describe("putting a recap away", () => {
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const recap = (id: string): Recap => ({
        id,
        timestamp: 1_700_000_000_000,
        playCountSort: [],
        listenDurationSort: [],
    });

    const mount = (recaps: { daily: Recap | null; weekly: Recap | null }) => {
        const markRecapSeen = vi.fn().mockResolvedValue(true);
        const onDismissed = vi.fn();
        const close = vi.fn();

        render(
            <RecapDrawer
                open={() => { }}
                close={close}
                isOpen
                daily={recaps.daily}
                weekly={recaps.weekly}
                user={{ markRecapSeen } as unknown as User}
                onDismissed={onDismissed}
            />
        );

        return { markRecapSeen, onDismissed, close };
    };

    const closeIt = () => fireEvent.click(screen.getByRole("button", { name: "Close recap" }));

    it("closes on the button, without waiting for the server", () => {
        const { close } = mount({ daily: recap("daily-id"), weekly: null });

        closeIt();

        expect(close).toHaveBeenCalled();
    });

    it("reports the recap it put away, so the shell stops offering it", () => {
        const { onDismissed } = mount({ daily: recap("daily-id"), weekly: null });

        closeIt();

        expect(onDismissed).toHaveBeenCalledWith(["daily-id"]);
    });

    it("puts away both recaps, not just the tab in front", () => {
        // The tabs open on the daily, and marking only that one left the
        // weekly to reopen the drawer at the next poll.
        const { onDismissed, markRecapSeen } = mount({
            daily: recap("daily-id"),
            weekly: recap("weekly-id"),
        });

        closeIt();

        expect(onDismissed).toHaveBeenCalledWith(["daily-id", "weekly-id"]);
        expect(markRecapSeen.mock.calls.map(([type]) => type)).toEqual(["daily", "weekly"]);
    });

    it("closes even when the mark cannot be sent at all", () => {
        // The refusal is the point of the case, so its log is not a surprise.
        vi.spyOn(console, "error").mockImplementation(() => { });

        const markRecapSeen = vi.fn().mockRejectedValue(new Error("offline"));
        const onDismissed = vi.fn();
        const close = vi.fn();

        render(
            <RecapDrawer
                open={() => { }}
                close={close}
                isOpen
                daily={recap("daily-id")}
                weekly={null}
                user={{ markRecapSeen } as unknown as User}
                onDismissed={onDismissed}
            />
        );

        closeIt();

        expect(close).toHaveBeenCalled();
        expect(onDismissed).toHaveBeenCalledWith(["daily-id"]);
    });

    it("marks a lone daily recap seen once it has been on screen a moment", async () => {
        // The backstop used to be armed by a change of tab and nothing else,
        // so it never ran for the one recap most people ever see.
        vi.useFakeTimers({ shouldAdvanceTime: true });

        const { markRecapSeen } = mount({ daily: recap("daily-id"), weekly: null });

        expect(markRecapSeen).not.toHaveBeenCalled();

        vi.advanceTimersByTime(2600);

        await waitFor(() => expect(markRecapSeen).toHaveBeenCalledWith("daily"));
    });

    it("does not mark the same recap twice over", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });

        const { markRecapSeen } = mount({ daily: recap("daily-id"), weekly: null });

        vi.advanceTimersByTime(2600);

        await waitFor(() => expect(markRecapSeen).toHaveBeenCalledTimes(1));

        closeIt();

        expect(markRecapSeen).toHaveBeenCalledTimes(1);
    });
});
