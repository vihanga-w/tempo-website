import { describe, it, expect } from "vitest";

import { settleOrder } from "./settled-order";

/**
 * The two failure modes are opposite and both bad: move too eagerly and the
 * cards swap places all evening, hold too hard and the section describes
 * something that stopped being true minutes ago.
 */
describe("settleOrder", () => {
    const QUIET = 5000;
    const NOW = 1_700_000_000_000;

    it("holds a reshuffle that arrives too soon", () => {
        const result = settleOrder(["a", "b", "c"], ["c", "a", "b"], NOW - 1000, NOW, QUIET);

        expect(result.order).toEqual(["a", "b", "c"]);
    });

    it("says when the held reshuffle is worth asking about again", () => {
        const result = settleOrder(["a", "b", "c"], ["c", "a", "b"], NOW - 1000, NOW, QUIET);

        expect(result.retryIn).toBe(4000);
    });

    it("applies a reshuffle once the floor has passed", () => {
        const result = settleOrder(["a", "b", "c"], ["c", "a", "b"], NOW - QUIET, NOW, QUIET);

        expect(result.order).toEqual(["c", "a", "b"]);
        expect(result.retryIn).toBeNull();
    });

    it("lets somebody who stopped listening leave at once", () => {
        // Holding them would leave a card claiming they are playing something
        const result = settleOrder(["a", "b", "c"], ["a", "b"], NOW, NOW, QUIET);

        expect(result.order).toEqual(["a", "b"]);
        expect(result.retryIn).toBeNull();
    });

    it("lets somebody who just started appear at once", () => {
        const result = settleOrder(["a", "b"], ["c", "a", "b"], NOW, NOW, QUIET);

        expect(result.order).toEqual(["c", "a", "b"]);
    });

    it("does not hold a change of membership that is also a reshuffle", () => {
        const result = settleOrder(["a", "b", "c"], ["d", "c", "a"], NOW, NOW, QUIET);

        expect(result.order).toEqual(["d", "c", "a"]);
    });

    it("asks for nothing when the order already matches", () => {
        const result = settleOrder(["a", "b"], ["a", "b"], NOW, NOW, QUIET);

        expect(result.order).toEqual(["a", "b"]);
        expect(result.retryIn).toBeNull();
    });

    it("cannot be starved by a friend who keeps skipping", () => {
        // The whole reason this is a floor and not a debounce: each new change
        // arrives before the last has settled, and the order still moves
        let order = ["a", "b", "c"];
        let movedAt = NOW;

        for (let i = 1; i <= 6; i++) {
            const at = NOW + (i * 2000);
            const wanted = i % 2 === 0 ? ["c", "a", "b"] : ["b", "c", "a"];
            const result = settleOrder(order, wanted, movedAt, at, QUIET);

            if (result.order[0] !== order[0])
                movedAt = at;

            order = result.order;
        }

        // Twelve seconds of churn, and it has moved rather than frozen
        expect(order).not.toEqual(["a", "b", "c"]);
    });
});
