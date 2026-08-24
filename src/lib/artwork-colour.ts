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
export async function extractArtworkColour(src: string): Promise<Rgb | null> {
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

    if (bins.size === 0)
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
 * A flat panel colour from the artwork.
 *
 * Mixed down into the page rather than faded across the panel. The panel used to
 * be a three stop gradient, which is a great deal of ceremony for "make this
 * darker towards the bottom", and it still left the fill lighter at the top than
 * white text could safely sit on when the cover was a pale one. Mixing to a
 * fixed ratio and then capping the result's luminance gives one colour that is
 * always dark enough to read on, and a solid block of a record's own colour is
 * bolder than a wash of it.
 */
export function panelFill(rgb: Rgb): string {
    const mix = (channel: number, page: number) => channel * 0.58 + page * 0.42;

    let r = mix(rgb.r, 13);
    let g = mix(rgb.g, 13);
    let b = mix(rgb.b, 14);

    // Rec. 709 luminance on the raw channels. It does not need to be exact — it
    // only has to keep a white sleeve from producing a panel the size of the
    // screen that white text then sits on
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const CEILING = 0.22;

    if (luminance > CEILING) {
        const scale = CEILING / luminance;

        r *= scale;
        g *= scale;
        b *= scale;
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
