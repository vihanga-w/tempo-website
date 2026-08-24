import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

import { SkeletonImage } from "./playback-state";

/**
 * jsdom never actually loads an image, so `complete` and `naturalWidth` are
 * stood in for. Both matter and they are opposites: an image the browser
 * finished before React was listening, and one that has not arrived.
 */
let imageComplete = false;
let imageNaturalWidth = 0;

beforeAll(() => {
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
        configurable: true,
        get: () => imageComplete,
    });

    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
        configurable: true,
        get: () => imageNaturalWidth,
    });
});

afterAll(() => {
    delete (HTMLImageElement.prototype as any).complete;
    delete (HTMLImageElement.prototype as any).naturalWidth;
});

afterEach(() => {
    cleanup();

    imageComplete = false;
    imageNaturalWidth = 0;
});

/** Chakra styles through a class, so the inline style is not where this lands. */
function opacityOf(element: Element) {
    return getComputedStyle(element).opacity;
}

/** 16 pixels of the same red, encoded the way the server encodes them. */
const RED_BLOB = Buffer.from(
    new Array(16).fill([220, 20, 20]).flat(),
).toString("base64");

function renderImage(props: Partial<Parameters<typeof SkeletonImage>[0]> = {}) {
    return render(
        <SkeletonImage
            src="/picture.jpg"
            width="56px"
            height="56px"
            borderRadius="18px"
            {...props}
        />,
    );
}

describe("SkeletonImage", () => {
    /*
     * The regression, and it was not a small one. Opacity was driven entirely by
     * an onLoad handler, and an image already in cache never fires one — the
     * browser finishes it before React attaches the handler, which is what
     * happens to every avatar the second time you see it. The load was missed,
     * the picture stayed at zero opacity, and what showed was the skeleton
     * behind it, indefinitely. It looked like an image that had failed to load
     * when in fact it had loaded before anything was listening.
     */
    it("shows an image that was already cached when it mounted", async () => {
        imageComplete = true;
        imageNaturalWidth = 600;

        const { container } = renderImage({ src: "/cached.jpg" });

        await waitFor(() => {
            expect(opacityOf(container.querySelector("img")!)).toBe("1");
        });
    });

    it("does not show an image that has not arrived yet", () => {
        const { container } = renderImage({ src: "/slow.jpg" });

        expect(opacityOf(container.querySelector("img")!)).toBe("0");
    });

    /*
     * complete is also true for an image that failed, so it cannot be the only
     * thing consulted — that would fade a broken image in over its placeholder
     * and leave an empty box.
     */
    it("does not mistake a failed image for a loaded one", () => {
        imageComplete = true;
        imageNaturalWidth = 0;

        const { container } = renderImage({ src: "/broken.jpg" });

        expect(opacityOf(container.querySelector("img")!)).toBe("0");
    });

    it("still shows an image that loads the ordinary way", async () => {
        const { container } = renderImage({ src: "/slow.jpg" });

        const image = container.querySelector("img")!;

        expect(opacityOf(image)).toBe("0");

        imageComplete = true;
        imageNaturalWidth = 600;
        image.dispatchEvent(new Event("load"));

        await waitFor(() => {
            expect(opacityOf(image)).toBe("1");
        });
    });

    it("draws the colour blob behind a picture that has not loaded", () => {
        const { container } = renderImage({ src: "/slow.jpg", colourBlob: RED_BLOB });

        const placeholder = [...container.querySelectorAll("div")]
            .find(element => element.style.backgroundImage.includes("radial-gradient"));

        expect(placeholder).toBeTruthy();
        // Whitespace between the channels is up to whoever serialised it
        expect(placeholder!.style.backgroundImage).toMatch(/rgb\(\s*220,\s*20,\s*20\s*\)/);
    });

    it("falls back to the skeleton when there is no blob", () => {
        const { container } = renderImage({ src: "/slow.jpg" });

        const withGradient = [...container.querySelectorAll("div")]
            .filter(element => element.style.backgroundImage.includes("radial-gradient"));

        expect(withGradient).toHaveLength(0);
    });

    it("ignores a blob it cannot read rather than drawing nothing at all", () => {
        const { container } = renderImage({ src: "/slow.jpg", colourBlob: "not-a-blob" });

        expect(container.querySelector("img")).toBeTruthy();
    });

    it("goes back to waiting when the picture it is showing changes", async () => {
        imageComplete = true;
        imageNaturalWidth = 600;

        const { container, rerender } = renderImage({ src: "/first.jpg" });

        await waitFor(() => {
            expect(opacityOf(container.querySelector("img")!)).toBe("1");
        });

        // The next picture has not arrived, so the one on screen must not be
        // left showing in its place
        imageComplete = false;
        imageNaturalWidth = 0;

        rerender(
            <SkeletonImage src="/second.jpg" width="56px" height="56px" borderRadius="18px" />,
        );

        await waitFor(() => {
            const image = container.querySelector("img")!;

            expect(image.getAttribute("src")).toBe("/second.jpg");
            expect(opacityOf(image)).toBe("0");
        });
    });
});
