import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { RECAP_DISMISSED_KEY, RECAP_DISMISSED_TTL } from "./const";
import {
    pruneRecapDismissals, withRecapsDismissed, readRecapDismissals, writeRecapDismissals,
} from "./recap-dismissals";

/**
 * A recap drawer covers the whole interface and its close button is the only
 * way out, so this record is what stands between a reader and a recap that
 * reopens every thirty seconds - and at every launch, since a new daily recap
 * is published each morning. It has to hold for as long as the server would
 * still offer the recap, survive a reload, and never be the thing that throws
 * on the way out of the drawer.
 */
describe("recap dismissals", () => {
    const NOW = 1_700_000_000_000;
    const DAY = 24 * 3600e3;

    beforeEach(() => {
        localStorage.clear();
        vi.spyOn(console, "warn").mockImplementation(() => { });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("keeps a dismissal for as long as a recap can be served", () => {
        // The weekly recap is offered for a week after it becomes available.
        const kept = pruneRecapDismissals({ weekly: NOW - (7 * DAY) }, NOW);

        expect(kept).toEqual({ weekly: NOW - (7 * DAY) });
    });

    it("drops a dismissal too old to suppress anything", () => {
        const kept = pruneRecapDismissals({ old: NOW - RECAP_DISMISSED_TTL - 1 }, NOW);

        expect(kept).toEqual({});
    });

    it("remembers a recap without forgetting the ones already put away", () => {
        const dismissed = withRecapsDismissed({ yesterday: NOW - DAY }, ["today"], NOW);

        expect(dismissed).toEqual({ yesterday: NOW - DAY, today: NOW });
    });

    it("puts away a daily and a weekly together", () => {
        // Closing the drawer dismisses every recap it was showing, not just
        // the tab in front - the other one used to reopen it seconds later.
        const dismissed = withRecapsDismissed({}, ["daily-id", "weekly-id"], NOW);

        expect(Object.keys(dismissed).sort()).toEqual(["daily-id", "weekly-id"]);
    });

    it("prunes as it records, so the record cannot grow forever", () => {
        const dismissed = withRecapsDismissed(
            { ancient: NOW - RECAP_DISMISSED_TTL - 1 }, ["today"], NOW
        );

        expect(dismissed).toEqual({ today: NOW });
    });

    it("survives a reload", () => {
        // A rate-limited request used to answer with a full reload, and the
        // recap was waiting on the other side of it.
        writeRecapDismissals(withRecapsDismissed({}, ["daily-id"], NOW));

        expect(readRecapDismissals()).toEqual({ "daily-id": NOW });
    });

    it("reads as nothing dismissed when there is no record", () => {
        expect(readRecapDismissals()).toEqual({});
    });

    it("reads as nothing dismissed when the record is unreadable", () => {
        localStorage.setItem(RECAP_DISMISSED_KEY, "{not json");

        expect(readRecapDismissals()).toEqual({});
    });

    it("does not throw when storage refuses the write", () => {
        // This runs on the way out of the drawer: a throw here would be the
        // close button failing again, for a new reason.
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("QuotaExceededError");
        });

        expect(() => writeRecapDismissals({ "daily-id": NOW })).not.toThrow();
        expect(writeRecapDismissals({ "daily-id": NOW })).toBe(false);
    });
});
