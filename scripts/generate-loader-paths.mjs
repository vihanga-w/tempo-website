/**
 * Turns the word "Tempo" into outlines, once, so the loader never waits for a
 * font.
 *
 * The loader rewrites the word in a different handwriting five times a second.
 * Loading twelve fonts for that means twelve chances to be caught mid-download,
 * and the word snapping out of a fallback is exactly what a loading screen
 * should not be doing. Outlines have no such moment: they are already in the
 * bundle, and there is nothing left to arrive.
 *
 * Run when the list of hands changes:
 *
 *     node scripts/generate-loader-paths.mjs
 *
 * Writes src/components/loader-word-paths.ts, which is committed - this needs
 * the network and has no business running during a build.
 */

import { writeFileSync } from "node:fs";
// CommonJS, so it arrives as a default export rather than named ones
import opentype from "opentype.js";

const WORD = "Tempo";

/** The hands, with the size each was chosen to be read at. */
const FONTS = [
    { family: "Nanum Pen Script", size: 50 },
    { family: "Caveat", size: 42 },
    { family: "Shadows Into Light", size: 42 },
    { family: "Shadows Into Light Two", size: 42 },
    { family: "Indie Flower", size: 42 },
    { family: "Gloria Hallelujah", size: 38 },
    { family: "Single Day", size: 44 },
    { family: "Reenie Beanie", size: 44 },
    { family: "Schoolbell", size: 44 },
    { family: "Gluten", size: 32 },
    { family: "Rock Salt", size: 26 },
    { family: "Nothing You Could Do", size: 32 },
];

/**
 * Google serves woff2 to anything modern and plain TrueType to anything not,
 * and opentype.js reads TrueType - so ask as something old.
 */
async function ttfUrlFor(family) {
    const res = await fetch(`https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}`, {
        headers: { "User-Agent": "Mozilla/4.0" },
    });

    if (!res.ok)
        throw new Error(`${family}: stylesheet came back ${res.status}`);

    const css = await res.text();
    const url = css.match(/url\((https:\/\/[^)]+\.ttf)\)/);

    if (!url)
        throw new Error(`${family}: no TrueType in the stylesheet`);

    return url[1];
}

/**
 * Writes a path out by hand, rather than through opentype's own formatter.
 *
 * That formatter emitted a NaN into two of the twelve - one coordinate of one
 * curve, in fonts whose commands are all perfectly finite when inspected. A
 * renderer abandons a path at the first token it cannot read, so those two
 * words drew their first letter and stopped. Formatting the numbers here keeps
 * that between us and the file, and the check below makes sure it stays fixed.
 */
function toPathData(path, decimals = 2) {
    const n = (value) => {
        const rounded = Number(Number(value).toFixed(decimals));

        if (!Number.isFinite(rounded))
            throw new Error(`non-finite coordinate: ${value}`);

        return String(rounded);
    };

    return path.commands.map((c) => {
        switch (c.type) {
            case "M": return `M${n(c.x)} ${n(c.y)}`;
            case "L": return `L${n(c.x)} ${n(c.y)}`;
            case "C": return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
            case "Q": return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
            case "Z": return "Z";
            default: throw new Error(`unknown path command: ${c.type}`);
        }
    }).join("");
}

async function outlineFor({ family, size }) {
    const response = await fetch(await ttfUrlFor(family));
    const parsed = opentype.parse(Buffer.from(await response.arrayBuffer()).buffer);

    // Drawn from a baseline of zero, then measured, so the box below can be
    // placed around whatever the letters actually occupy rather than around the
    // em square - these hands overshoot it in both directions
    const path = parsed.getPath(WORD, 0, 0, size);
    const { x1, y1, x2, y2 } = path.getBoundingBox();

    return {
        family,
        size,
        path: toPathData(path, 2),
        // A little air, so a descender or a flourish is never clipped
        viewBox: [x1 - 2, y1 - 2, (x2 - x1) + 4, (y2 - y1) + 4].map((v) => Math.round(v * 100) / 100).join(" "),
        width: Math.round((x2 - x1) + 4),
        height: Math.round((y2 - y1) + 4),
    };
}

const outlines = [];

for (const font of FONTS) {
    const outline = await outlineFor(font);

    // Nothing invalid gets written. This is the whole failure mode: a path a
    // renderer gives up partway through looks like a font that half-loaded,
    // and says nothing about itself.
    if (/NaN|undefined|Infinity/.test(outline.path))
        throw new Error(`${font.family}: path data is not renderable`);

    // "Tempo" is five letters, none of which draw in one stroke
    if (outline.path.split("M").length - 1 < 5)
        throw new Error(`${font.family}: only ${outline.path.split("M").length - 1} subpaths - letters are missing`);

    outlines.push(outline);

    console.log("outlined", font.family.padEnd(24), `${outline.width}x${outline.height}`);
}

const file = `/**
 * The word "Tempo", drawn in each of the loader's hands.
 *
 * Generated by scripts/generate-loader-paths.mjs - do not edit by hand. These
 * are outlines rather than text so the loader has no font to wait for: twelve
 * families loading behind a screen that changes five times a second gave twelve
 * chances to catch the word mid-swap, in a fallback face.
 *
 * The fonts are Google Fonts, under the SIL Open Font License.
 */

export interface LoaderWord {
    /** The hand this was drawn in, for reference. */
    family: string;
    /** Outline data for the word, at the size the hand was chosen for. */
    path: string;
    /** Sized to the letters themselves rather than the em square. */
    viewBox: string;
    width: number;
    height: number;
}

export const LOADER_WORDS: LoaderWord[] = ${JSON.stringify(outlines.map(({ family, path, viewBox, width, height }) =>
    ({ family, path, viewBox, width, height })), null, 4)};
`;

writeFileSync(new URL("../src/components/loader-word-paths.ts", import.meta.url), file);

console.log(`\nwrote ${outlines.length} outlines`);
