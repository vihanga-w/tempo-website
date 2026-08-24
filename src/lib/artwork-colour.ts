import { FastAverageColor } from "fast-average-color";
import { apcach, crToBg } from "apcach";
import { oklch, formatHex } from "culori";
import { getSizedImageUrl } from "./sized-img";

/**
 * Taking a colour off a piece of album art, and making it usable.
 *
 * This lives apart from the profile page because it is the one piece of that
 * page with a right and a wrong answer that can be checked — /dev-colour runs
 * exactly these functions over real covers.
 */

export interface Rgb {
    r: number;
    g: number;
    b: number;
}

export const PAGE_BG = "#0D0D0E";

/** The app's own accent, for when there is no artwork to take a colour from. */
export const FALLBACK_ACCENT = "#A480FF";

/** "rgb(12, 34, 56)", as FastAverageColor hands it over. */
export function parseRgb(value: string): Rgb | null {
    const parts = value.match(/\d+/g);

    if (!parts || parts.length < 3)
        return null;

    return { r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]) };
}

function componentToHex(c: number) {
    const hex = Math.ceil(Math.min(Math.max(c, 0), 255)).toString(16);

    return (hex.length === 1 ? "0" + hex : hex);
}

export function rgbToHex({ r, g, b }: Rgb) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

export function hexToRgb(hex: string): Rgb | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

    return (result
        ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
        : null);
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;

    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;

    if (d === 0)
        return { h: 0, s: 0, l };

    const s = d / (1 - Math.abs(2 * l - 1));

    let h: number;

    if (max === rn)
        h = ((gn - bn) / d) % 6;
    else if (max === gn)
        h = (bn - rn) / d + 2;
    else
        h = (rn - gn) / d + 4;

    return { h: (h * 60 + 360) % 360, s, l };
}

/** 1 at the target, falling away smoothly on either side. */
function nearness(value: number, target: number, spread: number): number {
    return Math.exp(-Math.pow(value - target, 2) / (2 * spread * spread));
}

/**
 * How big a sample to take, and — because it is passed to the image endpoint —
 * how big an image to ask for.
 *
 * 96 is a size the endpoint already serves elsewhere on this page, so it is
 * known to be one of the allowed ones, and it means the sample is drawn at 1:1
 * with no resampling on the way in. The bins are 32 levels a channel; more
 * pixels than this only slows the read down without moving the answer.
 */
const SAMPLE_SIZE = 96;

function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
        const img = new Image();

        // Set before src, or the request goes out without the CORS mode and the
        // canvas is tainted by the time anything can be read back off it
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/**
 * The colour a cover should paint the page.
 *
 * Neither the average nor simply the most common colour, both of which were
 * tried and are on the bench at /dev-colour:
 *
 *   - The average of every pixel is the mean of a picture, and the mean of a
 *     picture is mud. In Rainbows — a sleeve of pure yellow, blue and red —
 *     averages to rgb(139, 98, 69), a milky brown that appears nowhere on it.
 *     The failure gets worse the more colourful the artwork is, which is exactly
 *     backwards.
 *   - The most common colour is better, but the largest region of a cover is
 *     usually its background. After Hours came out olive: the dark khaki behind
 *     the portrait genuinely is the biggest area of that sleeve, and it is not
 *     what anybody would answer if you asked them what colour the cover was.
 *
 * So the count is scored rather than obeyed. Pixels are binned, and each bin is
 * weighted by how populous it is, how saturated it is, and how near mid
 * lightness it is — the colour somebody would point at is usually a vivid one
 * that is neither washed out nor nearly black, even when a duller colour covers
 * more of the sleeve. It is the same trade Android's Palette makes for its
 * "vibrant" swatch.
 *
 * A cover with no colour in it at all — a greyscale sleeve — has nothing to find
 * here, and falls through to the most populous bin so the caller still gets the
 * grey it will turn into white.
 */
/**
 * The colours actually present on a cover, binned and counted.
 *
 * Shared by the single accent and the palette below, so the two can never
 * disagree about what is on the sleeve — they are reading the same numbers,
 * and only choosing from them differently.
 */
type Bin = { r: number; g: number; b: number; n: number };

async function sampleBins(src: string): Promise<Map<number, Bin> | null> {
    /*
     * Read the small variant, not the original.
     *
     * A cover on Spotify's CDN is 640 pixels square and around 40KB, and this
     * was fetching that in full to look at 96 pixels of it — on every track
     * change, on top of the copy the page was already showing. The endpoint
     * serves the same image at 96 for about 3KB, and it sends
     * access-control-allow-origin, so the canvas can still be read back.
     *
     * getSizedImageUrl leaves anything that is not a Spotify CDN URL alone, so
     * the /dev-colour bench and its local files go through here unchanged.
     */
    const sized = getSizedImageUrl(src, SAMPLE_SIZE, SAMPLE_SIZE);

    // Falling back to the original covers the endpoint refusing the size or
    // being unreachable: a page that keeps its colour beats one that loses it
    const image = (await loadImage(sized)) ?? (sized === src ? null : await loadImage(src));

    if (!image)
        return null;

    const canvas = document.createElement("canvas");

    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (!ctx)
        return null;

    ctx.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    let pixels: Uint8ClampedArray;

    try {
        pixels = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    } catch {
        // A cover served without CORS headers taints the canvas. Nothing to be
        // done about it here, and it is not worth an error — the page simply
        // keeps the accent it already has
        return null;
    }

    const bins = new Map<number, { r: number; g: number; b: number; n: number }>();

    for (let i = 0; i < pixels.length; i += 4) {
        const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];

        if (a < 128)
            continue;

        // Near black and near white are discounted rather than scored down:
        // almost every sleeve has a large dark or blown out area, and left in it
        // wins on sheer count and hands back something that is not a colour
        const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;

        if (l < 0.06 || l > 0.95)
            continue;

        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        const bin = bins.get(key);

        if (bin) {
            bin.r += r;
            bin.g += g;
            bin.b += b;
            bin.n += 1;
        } else {
            bins.set(key, { r, g, b, n: 1 });
        }
    }

    return (bins.size === 0 ? null : bins);
}

export async function extractArtworkColour(src: string): Promise<Rgb | null> {
    const bins = await sampleBins(src);

    if (!bins)
        return null;

    let mostPopulous: Rgb | null = null;
    let mostPopulousCount = 0;
    let best: Rgb | null = null;
    let bestScore = -1;

    let largest = 0;

    for (const bin of bins.values())
        largest = Math.max(largest, bin.n);

    for (const bin of bins.values()) {
        const mean: Rgb = { r: bin.r / bin.n, g: bin.g / bin.n, b: bin.b / bin.n };
        const { s, l } = rgbToHsl(mean);

        if (bin.n > mostPopulousCount) {
            mostPopulousCount = bin.n;
            mostPopulous = mean;
        }

        // Weighted the way Palette weights its vibrant target: lightness matters
        // most, then saturation and population equally. Population is the
        // tie-breaker rather than the driver, which is the whole point
        const score =
            nearness(l, 0.5, 0.28) * 0.52 +
            nearness(s, 1, 0.42) * 0.24 +
            (bin.n / largest) * 0.24;

        // A bin with no colour in it cannot be the colour of the sleeve, however
        // much of the sleeve it covers
        if (s < 0.2)
            continue;

        if (score > bestScore) {
            bestScore = score;
            best = mean;
        }
    }

    const chosen = best ?? mostPopulous;

    return (chosen
        ? { r: Math.round(chosen.r), g: Math.round(chosen.g), b: Math.round(chosen.b) }
        : null);
}

/** The old behaviour, kept so /dev-colour can put them side by side. */
export async function averageArtworkColour(src: string): Promise<Rgb | null> {
    const colour = await new FastAverageColor().getColorAsync(src);

    return parseRgb(colour.rgb);
}

/** The plain most-common colour, also for the bench. */
export async function dominantArtworkColour(src: string): Promise<Rgb | null> {
    const colour = await new FastAverageColor().getColorAsync(src, {
        algorithm: "dominant",
        ignoredColor: [
            [0, 0, 0, 255, 42],
            [255, 255, 255, 255, 42],
        ],
    });

    return parseRgb(colour.rgb);
}

/** Shortest way round the wheel between two hues. */
function hueGap(a: number, b: number): number {
    const raw = Math.abs(a - b) % 360;

    return (raw > 180 ? 360 - raw : raw);
}

/**
 * Several colours off a cover, chosen to be worth looking at.
 *
 * The single accent is picked to be typical of a sleeve. A wash wants the
 * opposite: the colours that make the record look like itself, not the muddy
 * average of all of them. So this reads the same bins and selects differently —
 * saturation is weighted above population, and anything grey, nearly black or
 * blown out is dropped outright rather than scored down. A wash built from the
 * three greys that happen to cover most of a sleeve is a wash nobody would have
 * asked for.
 *
 * Hues have to be far enough apart to be separate colours. Four shades of the
 * same orange is one colour shown four times, and blurred together it comes back
 * as exactly that one colour.
 *
 * A sleeve that cannot fill the set has it completed from the wheel — the
 * complement first, then the two thirds — carrying the lightness and saturation
 * of what was actually found so the additions belong with it. A sleeve with no
 * colour on it at all returns nothing rather than being given some: inventing a
 * hue for a black and white cover is how Nevermind ends up green.
 */
export async function extractArtworkPalette(src: string, count = 4): Promise<string[]> {
    const bins = await sampleBins(src);

    if (!bins)
        return [];

    let largest = 0;

    for (const bin of bins.values())
        largest = Math.max(largest, bin.n);

    const candidates: { h: number; s: number; l: number; score: number }[] = [];

    for (const bin of bins.values()) {
        const mean: Rgb = { r: bin.r / bin.n, g: bin.g / bin.n, b: bin.b / bin.n };
        const { h, s, l } = rgbToHsl(mean);

        // Grey is not a colour to build a wash out of, and a hue carried at this
        // little light or this much of it does not survive being blurred
        if (s < 0.26 || l < 0.16 || l > 0.9)
            continue;

        candidates.push({
            h,
            s,
            l,
            score:
                nearness(l, 0.58, 0.3) * 0.4 +
                nearness(s, 1, 0.5) * 0.42 +
                (bin.n / largest) * 0.18,
        });
    }

    candidates.sort((a, b) => b.score - a.score);

    const MIN_HUE_GAP = 26;
    const chosen: { h: number; s: number; l: number }[] = [];

    for (const candidate of candidates) {
        if (chosen.some(picked => hueGap(picked.h, candidate.h) < MIN_HUE_GAP))
            continue;

        chosen.push(candidate);

        if (chosen.length === count)
            break;
    }

    if (chosen.length === 0)
        return [];

    // Lifted towards something worth looking at: a wash is going to be blurred
    // and masked, and both of those take colour out
    const vivid = (h: number, s: number, l: number) => formatHex({
        mode: "hsl",
        h: ((h % 360) + 360) % 360,
        s: Math.min(1, Math.max(s, 0.55)),
        l: Math.min(0.72, Math.max(l, 0.42)),
    }) ?? "#ffffff";

    const out = chosen.map(picked => vivid(picked.h, picked.s, picked.l));

    // The wheel, in the order the additions stop being obviously invented
    const TURNS = [180, 120, 240, 60, 300];
    const lead = chosen[0];

    for (let turn = 0; out.length < count && turn < TURNS.length; turn++) {
        const h = lead.h + TURNS[turn];

        if (chosen.some(picked => hueGap(picked.h, h) < MIN_HUE_GAP))
            continue;

        out.push(vivid(h, lead.s, lead.l));
    }

    return out;
}

/**
 * A colour off the artwork that text can actually sit on.
 *
 * A dominant colour is still whatever it is — often too dark to read as ink on a
 * near black page — so it is pushed to a lightness that clears APCA 60 against
 * the page while its hue is held.
 */
export function readableAccent(rgb: Rgb): string {
    const { r, g, b } = rgb;
    const hex = rgbToHex(rgb);

    // A greyscale cover has no hue worth keeping; tinting off it produces an
    // off-white that reads as a rendering fault rather than as a colour
    const isGrey = Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15;

    if (isGrey)
        return "#ffffff";

    const h = oklch(hex);
    const ideal = apcach(crToBg(hex, 60), h?.c ?? 0, h?.h ?? 0);

    const lifted = formatHex(oklch({
        mode: "oklch",
        l: Math.max(ideal.lightness, 0.8),
        // Held up, or a dark cover's hue survives the lift as a pastel. The
        // source chroma is the ceiling, so a genuinely muted cover stays muted
        c: Math.min(Math.max(ideal.chroma, 0.09), h?.c ?? 0.09),
        h: ideal.hue,
    }));

    return (lifted ?? "#ffffff");
}

/**
 * How much colour a surface is allowed to carry, and how light it sits.
 *
 * Chroma is clamped rather than pinned: a vivid sleeve is brought down to the
 * ceiling, and a muted one is left where it is rather than being pushed up to
 * meet it. Lightness is pinned, because it is what the white text on this panel
 * has to read against and it should not depend on the record.
 *
 * The ceiling is low on purpose. Material 3 builds surfaces at chroma 8 and
 * accents at chroma 48 — roughly 0.03 and 0.15 here — and the reason for that
 * gap is the area effect: the same colour over a large field reads as more
 * saturated than it does in a small swatch, which is why a paint chip never
 * looks like the wall. This panel is the largest area of colour on the page, so
 * it needs materially less chroma than the accent taken off the same sleeve, not
 * the same amount.
 */
const PANEL_LIGHTNESS = 0.31;
const PANEL_CHROMA = 0.038;

/**
 * A flat panel colour from the artwork.
 *
 * Worked out in OKLCH rather than mixed in sRGB. Mixing a cover's colour towards
 * the page in gamma space is what made this panel muddy: sRGB midpoints are
 * perceptually wrong, so a vivid orange blended toward near black arrives as a
 * dirty rust rather than as a dark orange. Capping the result's luminance
 * afterwards made it worse, because scaling the channels evenly drops the
 * lightness while keeping the saturation — which is the recipe for mud.
 *
 * Setting lightness and chroma directly, and leaving the hue exactly where the
 * record put it, gives a surface that is unmistakably the colour of what is
 * playing without being a block of it.
 */
export function panelFill(rgb: Rgb): string {
    const source = oklch(rgbToHex(rgb));

    return formatHex({
        mode: "oklch",
        l: PANEL_LIGHTNESS,
        // A sleeve with no colour on it gets a neutral panel rather than a faint
        // arbitrary cast picked up off the noise in a greyscale image
        c: Math.min(source?.c ?? 0, PANEL_CHROMA),
        h: source?.h ?? 0,
    }) ?? "#1c1b20";
}

/**
 * A small tinted surface, for a chip sitting on the accent gradient.
 *
 * The listener tag is pinned to the top of the page, which is exactly where the
 * accent wash is strongest, so a flat grey pill reads as a piece of some other
 * interface that has been dropped on top of this one.
 *
 * Unlike panelFill this does not cap the luminance, it pins it: whatever the
 * record is, the chip lands at the same lightness and only the hue moves. The
 * chip carries 11.5px text in the accent colour, and a fill that wandered with
 * the artwork would take the contrast of that text with it — a pale cover would
 * wash it out and a dark one would leave the chip invisible.
 *
 * Pinned brighter than the flat grey it replaces, though, rather than level with
 * it. That grey read as a chip because it was cool against a warm page; once the
 * fill shares the accent's hue there is no separation left but lightness, and
 * matched luminance made the pill disappear into the wash it sits on.
 */
export function chipFill(rgb: Rgb): string {
    // Mixed towards the surface it replaces rather than towards the page, so an
    // account with no artwork to read and one with a grey cover land together
    const mix = (channel: number, surface: number) => channel * 0.34 + surface * 0.66;

    let r = mix(rgb.r, 28);
    let g = mix(rgb.g, 27);
    let b = mix(rgb.b, 32);

    // Rec. 709, matching panelFill. The flat surface this stands in for sits at
    // 0.108; this is deliberately clear of it, and still leaves the accent text
    // above APCA 70 against the chip — comfortably past the 60 readableAccent
    // is built to clear.
    const TARGET = 0.2;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

    if (luminance > 0) {
        const scale = TARGET / luminance;

        // A fully saturated accent can want more of one channel than there is,
        // and clamping without re-checking would quietly lighten the chip
        r = Math.min(255, r * scale);
        g = Math.min(255, g * scale);
        b = Math.min(255, b * scale);
    }

    return rgbToHex({ r, g, b });
}

/**
 * APCA Lc, as the guidelines above are stated in.
 *
 * Reverse polarity only — light text on a dark ground is the only direction this
 * app ever renders — which is why the exponents are 0.65/0.62 rather than the
 * 0.56/0.57 pair used for dark text on light.
 */
export function apcaLc(textHex: string, bgHex: string): number {
    const luminance = (hex: string) => {
        const rgb = hexToRgb(hex);

        if (!rgb)
            return 0;

        const ch = [rgb.r, rgb.g, rgb.b].map(v => Math.pow(v / 255, 2.4));

        return 0.2126729 * ch[0] + 0.7151522 * ch[1] + 0.0721750 * ch[2];
    };

    // Soft clamp near black, so very dark pairs do not report runaway contrast
    const clamp = (y: number) => (y > 0.022 ? y : y + Math.pow(0.022 - y, 1.414));

    const yText = clamp(luminance(textHex));
    const yBg = clamp(luminance(bgHex));

    const sapc = (Math.pow(yBg, 0.65) - Math.pow(yText, 0.62)) * 1.14;

    // Below the threshold the result is noise rather than a small contrast
    if (Math.abs(sapc) < 0.1)
        return 0;

    return Math.abs((sapc + 0.027) * 100);
}
