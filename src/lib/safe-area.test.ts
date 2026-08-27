import { afterEach, describe, expect, it } from "vitest";

import { ASSUMED_INSET, safeAreaInsetBottom } from "./safe-area";

/**
 * jsdom resolves neither env() nor a custom property, so the value has to be
 * stood in for. What is being tested is not the arithmetic — it is that the
 * reading goes through a real property rather than through the custom property
 * directly, which is where the original went wrong.
 */
function stubComputed(paddingBottom: string) {
    const real = window.getComputedStyle;

    window.getComputedStyle = ((element: Element) =>
        ({ ...real(element), paddingBottom })) as typeof window.getComputedStyle;

    return () => { window.getComputedStyle = real; };
}

const restores: (() => void)[] = [];

afterEach(() => {
    while (restores.length)
        restores.pop()!();
});

describe("safeAreaInsetBottom", () => {
    it("reads back the resolved length", () => {
        restores.push(stubComputed("34px"));

        expect(safeAreaInsetBottom()).toBe(34);
    });

    /*
     * The regression. This used to read the custom property straight off the
     * root element, and a custom property is not resolved until something uses
     * it — so what came back was the literal text `env(safe-area-inset-bottom,
     * 0px)`, which parses to NaN, and every device reserved nothing.
     */
    it("does not accept an unresolved env() as a measurement", () => {
        restores.push(stubComputed("env(safe-area-inset-bottom, 0px)"));

        expect(safeAreaInsetBottom(ASSUMED_INSET)).toBe(ASSUMED_INSET);
    });

    it("falls back when the browser computes nothing", () => {
        restores.push(stubComputed(""));

        expect(safeAreaInsetBottom(12)).toBe(12);
    });

    it("refuses a negative inset rather than reserving less than nothing", () => {
        restores.push(stubComputed("-10px"));

        expect(safeAreaInsetBottom(0)).toBe(0);
    });

    it("reports no inset on a device that has none", () => {
        restores.push(stubComputed("0px"));

        expect(safeAreaInsetBottom(ASSUMED_INSET)).toBe(0);
    });

    it("leaves nothing behind in the document", () => {
        restores.push(stubComputed("34px"));

        const before = document.body.childElementCount;
        safeAreaInsetBottom();

        expect(document.body.childElementCount).toBe(before);
    });
});
