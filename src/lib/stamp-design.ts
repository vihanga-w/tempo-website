/**
 * Picking a passport stamp for a country.
 *
 * Real stamps are not one shape and not one layout. A border post has a rubber
 * die, and the dies differ — circles with a double rule, ovals, serrated edges
 * cut like a postage stamp, flat-bottomed domes, hexagons, plain rectangles with
 * the country code boxed off in a corner the way Schengen does it.
 *
 * Inside, the same parts recur, and they are what make a shape read as a
 * passport stamp rather than a badge:
 *
 *   - the country curved around the top, between two rules
 *   - the port or authority curved around the bottom, reading the right way up
 *   - a date across the middle, ruled off above and below
 *   - a small pictogram saying how you arrived: a plane, a ship, a car
 *
 * Drawing one die per country would be two hundred pieces of artwork nobody
 * would finish, and most of them would be wrong. Instead there are nine frames
 * and a handful of decorations, and hashing the country picks between them. That
 * makes it deterministic — Nigeria is always the same stamp, on every device,
 * forever — while a page of them looks like a passport rather than a grid.
 *
 * Two deliberate departures from the real thing. The pictogram is a record, a
 * note or a wave, because you did not arrive by air, you arrived by listening.
 * And the ink is broken rather than solid: a die that has been used a few
 * hundred times does not print a clean line, and a perfect vector outline is the
 * single thing that most gives away a drawn stamp.
 */

/** The frame shapes a country can be stamped with. */
export type StampFrame =
    | "circle"
    | "oval"
    | "scallop"
    | "arch"
    | "rect"
    | "rectBox"
    | "hexagon"
    | "octagon"
    | "cushion";

export const STAMP_FRAMES: StampFrame[] = [
    "circle", "oval", "scallop", "arch",
    "rect", "rectBox", "hexagon", "octagon", "cushion",
];

/**
 * How the lettering is arranged.
 *
 * "ring" is the classic: country curved over the top, authority curved under the
 * bottom, both following the frame. Only frames that are round the whole way can
 * carry it. "flat" sets the country on a straight line instead.
 */
export type StampTextLayout = "ring" | "flat";

export type StampGlyph = "record" | "note" | "wave" | "none";

/** Frames whose outline is curved top and bottom, so text can follow it round. */
const RING_FRAMES: StampFrame[] = ["circle", "oval", "scallop"];

export interface StampDesign {
    frame: StampFrame;
    layout: StampTextLayout;
    /** Degrees. Small — a stamp is pressed by hand, not thrown at the page. */
    rotation: number;
    /** A second rule inside the frame. */
    innerRule: boolean;
    /** The date ruled off above and below, the way a date wheel prints. */
    dateBand: boolean;
    glyph: StampGlyph;
    /**
     * A dash pattern for the outline, so the ink breaks.
     *
     * Long marks and very short gaps: enough to stop the line being mechanically
     * perfect, not so much that it reads as a dashed border. Cheaper than the
     * turbulence filter this started as, which cost a full noise pass per stamp
     * and is not something to put twenty of on a phone.
     */
    inkBreaks: string;
    /**
     * Degrees of hue to shift the ink by.
     *
     * Border posts do not share an ink pad. Kept inside a narrow band so every
     * stamp still belongs to the app's violet rather than becoming a rainbow.
     */
    hueShift: number;
    /** 0-1, how heavily the die was pressed. */
    weight: number;
}

/**
 * FNV-1a, 32-bit.
 *
 * Any stable hash would do; this one is four lines, has no dependencies and
 * spreads short ASCII strings like country codes well enough that neighbouring
 * countries do not land on the same frame.
 */
export function hashSeed(input: string): number {
    let hash = 0x811c9dc5;

    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        // The FNV prime, by shift-and-add so it stays in 32 bits
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    return hash >>> 0;
}

const INK_BREAKS = [
    "none",
    "22 0.7 13 0.6",
    "30 0.9 8 0.5 17 0.7",
    "14 0.6",
    "40 1.1 20 0.7",
];

/**
 * The design for a country.
 *
 * Seeded on the country alone, never the date: a border post does not change its
 * die between months, so a country's second stamp is the same impression with a
 * different date on it. That is also what makes a repeat visit read as a repeat
 * rather than as somewhere new.
 */
export function stampDesign(countryCode: string, countryName: string): StampDesign {
    const seed = hashSeed(`${countryCode.toUpperCase()}|${countryName}`);

    const frame = STAMP_FRAMES[seed % STAMP_FRAMES.length];
    const glyphs: StampGlyph[] = ["record", "note", "wave", "none"];

    return {
        frame,
        layout: RING_FRAMES.includes(frame) ? "ring" : "flat",
        // -6 to +6 degrees
        rotation: ((seed >>> 5) % 13) - 6,
        innerRule: ((seed >>> 11) & 1) === 1,
        dateBand: ((seed >>> 12) & 1) === 1,
        glyph: glyphs[(seed >>> 17) % glyphs.length],
        inkBreaks: INK_BREAKS[(seed >>> 21) % INK_BREAKS.length],
        hueShift: (((seed >>> 24) % 33) - 16),
        weight: 0.82 + (((seed >>> 3) % 15) / 100),
    };
}

const MONTHS = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/**
 * The date as a stamp prints it: day, month, two-digit year.
 *
 * A real stamp carries the day, not just the month, because it is a date wheel.
 * The passport hands us the moment the stamp was earned, so there is a real day
 * to print and no reason to round it off to the month.
 */
export function stampDate(earnedAt: number): string {
    if (!Number.isFinite(earnedAt) || earnedAt <= 0)
        return "";

    const date = new Date(earnedAt);
    const day = date.getUTCDate();
    const month = MONTHS[date.getUTCMonth()];

    if (!month)
        return "";

    return `${day < 10 ? "0" : ""}${day} ${month} ${String(date.getUTCFullYear()).slice(2)}`;
}

/**
 * The country's three letter code, for the middle of the stamp.
 *
 * Passport stamps use ISO alpha-3 and we hold alpha-2, so this is a lookup of
 * the codes that differ rather than a full table — most alpha-3 codes are the
 * alpha-2 plus a letter, and where they are not, the country is usually one
 * somebody would notice getting wrong.
 */
const ALPHA3: { [alpha2: string]: string } = {
    AE: "ARE", AT: "AUT", AU: "AUS", BE: "BEL", BR: "BRA", CA: "CAN", CH: "CHE",
    CL: "CHL", CN: "CHN", CO: "COL", CZ: "CZE", DE: "DEU", DK: "DNK", EG: "EGY",
    ES: "ESP", ET: "ETH", FI: "FIN", FR: "FRA", GB: "GBR", GH: "GHA", GR: "GRC",
    GP: "GLP", HR: "HRV", HU: "HUN", ID: "IDN", IE: "IRL", IL: "ISR", IN: "IND",
    IS: "ISL", IT: "ITA", JM: "JAM", JP: "JPN", KE: "KEN", KR: "KOR", MA: "MAR",
    MQ: "MTQ", MX: "MEX", ML: "MLI", MY: "MYS", NG: "NGA", NL: "NLD", NO: "NOR",
    NZ: "NZL", PE: "PER", PH: "PHL", PL: "POL", PR: "PRI", PT: "PRT", RE: "REU",
    RO: "ROU", RS: "SRB", RU: "RUS", SE: "SWE", SG: "SGP", SN: "SEN", TH: "THA",
    TR: "TUR", TW: "TWN", TZ: "TZA", UA: "UKR", US: "USA", VN: "VNM", ZA: "ZAF",
};

export function stampCode(countryCode: string): string {
    const code = countryCode.toUpperCase();

    // A country not in the table keeps its two letters rather than being given
    // a third that might belong to somebody else.
    return ALPHA3[code] ?? code;
}

/**
 * Shift a hex colour's hue, keeping how light and how saturated it is.
 *
 * Used only for the small per-country variation in ink, so it works in HSL
 * rather than a perceptual space: the input is one known colour and the shift is
 * small, which is exactly the case where the simple conversion is indistinguish-
 * able from the careful one.
 */
export function shiftHue(hex: string, degrees: number): string {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());

    if (!match)
        return hex;

    const int = parseInt(match[1], 16);
    const r = ((int >> 16) & 255) / 255;
    const g = ((int >> 8) & 255) / 255;
    const b = (int & 255) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;

    if (d === 0)
        return hex;

    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h: number;

    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = ((b - r) / d) + 2;
    else h = ((r - g) / d) + 4;

    h = (((h * 60) + degrees) % 360 + 360) % 360;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    const [r2, g2, b2] =
        h < 60 ? [c, x, 0] :
        h < 120 ? [x, c, 0] :
        h < 180 ? [0, c, x] :
        h < 240 ? [0, x, c] :
        h < 300 ? [x, 0, c] : [c, 0, x];

    const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");

    return `#${to(r2)}${to(g2)}${to(b2)}`;
}
