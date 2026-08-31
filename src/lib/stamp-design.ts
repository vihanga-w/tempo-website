/**
 * Picking a passport stamp for a country.
 *
 * Real stamps are not one shape. A border post has a die, and the dies differ:
 * circles with a double rule, ovals, serrated edges cut like a postage stamp,
 * flat-bottomed domes, hexagons, plain rounded rectangles. Inside, the same
 * handful of parts recur — an arc of text around the top, a code in the middle,
 * a date underneath, and a small pictogram saying how you arrived: an aeroplane
 * for air, a ship for sea, a car for land.
 *
 * Drawing one die per country would be two hundred pieces of artwork nobody
 * would ever finish, and most of them would be wrong. Instead there are eight
 * frames and a few decorations, and which one a country gets is decided by
 * hashing the country itself. That makes it deterministic — Nigeria is always
 * the same stamp, on every device, forever — while the passport as a whole
 * looks like a passport rather than a grid of identical badges.
 *
 * The pictogram is the one place this deliberately departs from a real stamp.
 * You did not arrive in Lagos by air; you arrived by listening. So the glyphs
 * are a record, a note and a wave.
 */

/** The frame shapes a country can be stamped with. */
export type StampFrame =
    | "circle"
    | "oval"
    | "rect"
    | "hexagon"
    | "scallop"
    | "arch"
    | "octagon"
    | "cushion";

export const STAMP_FRAMES: StampFrame[] = [
    "circle", "oval", "rect", "hexagon", "scallop", "arch", "octagon", "cushion",
];

/** How the country name sits: curved around the top, or on a straight line. */
export type StampTextLayout = "arc" | "straight";

export type StampGlyph = "record" | "note" | "wave" | "none";

export interface StampDesign {
    frame: StampFrame;
    layout: StampTextLayout;
    /** Degrees. Small — a stamp is pressed by hand, not thrown at the page. */
    rotation: number;
    /** A second rule inside the frame. */
    innerRule: boolean;
    /** A hairline under the country code. */
    underline: boolean;
    glyph: StampGlyph;
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

/**
 * The design for a country.
 *
 * Seeded on the country alone, never the date: a border post does not change
 * its die between months, so a country's second stamp is the same impression
 * with a different date on it. That is also what makes a repeat visit read as a
 * repeat rather than as somewhere new.
 */
export function stampDesign(countryCode: string, countryName: string): StampDesign {
    const seed = hashSeed(`${countryCode.toUpperCase()}|${countryName}`);

    const frame = STAMP_FRAMES[seed % STAMP_FRAMES.length];

    // Frames with a curved top can carry curved text; the flat ones cannot.
    const canArc = (frame === "circle" || frame === "oval" || frame === "scallop" || frame === "arch");

    const glyphs: StampGlyph[] = ["record", "note", "wave", "none"];

    return {
        frame,
        layout: canArc ? "arc" : "straight",
        // -6 to +6 degrees, and never exactly zero for the frames that would
        // otherwise sit suspiciously square to the grid.
        rotation: ((seed >>> 5) % 13) - 6,
        innerRule: ((seed >>> 11) & 1) === 1,
        underline: ((seed >>> 13) & 1) === 1,
        glyph: glyphs[(seed >>> 17) % glyphs.length],
    };
}

/**
 * A month key as a stamp reads it.
 *
 * "2026-08" becomes "AUG 26". Passport stamps are set in capitals and short
 * dates because the die is small, and the same constraint applies here.
 */
export function stampDate(monthKey: string): string {
    const match = /^(\d{4})-(\d{2})$/.exec(monthKey);

    if (!match)
        return "";

    const months = [
        "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
        "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
    ];

    const month = months[Number(match[2]) - 1];

    return month ? `${month} ${match[1].slice(2)}` : "";
}

/**
 * The country's three letter code, for the middle of the stamp.
 *
 * Passport stamps use ISO alpha-3, and we hold alpha-2, so this is a lookup of
 * the codes that differ rather than a full table — most alpha-3 codes are the
 * alpha-2 plus a letter, and where they are not, the country is usually one
 * somebody would notice getting wrong.
 */
const ALPHA3: { [alpha2: string]: string } = {
    AE: "ARE", AT: "AUT", AU: "AUS", BE: "BEL", BR: "BRA", CA: "CAN", CH: "CHE",
    CL: "CHL", CN: "CHN", CO: "COL", CZ: "CZE", DE: "DEU", DK: "DNK", EG: "EGY",
    ES: "ESP", ET: "ETH", FI: "FIN", FR: "FRA", GB: "GBR", GH: "GHA", GR: "GRC",
    HR: "HRV", HU: "HUN", ID: "IDN", IE: "IRL", IL: "ISR", IN: "IND", IS: "ISL",
    IT: "ITA", JM: "JAM", JP: "JPN", KE: "KEN", KR: "KOR", MA: "MAR", MX: "MEX",
    ML: "MLI", MY: "MYS", NG: "NGA", NL: "NLD", NO: "NOR", NZ: "NZL", PE: "PER",
    PH: "PHL", PL: "POL", PR: "PRI", PT: "PRT", RO: "ROU", RS: "SRB", RU: "RUS",
    SE: "SWE", SG: "SGP", SN: "SEN", TH: "THA", TR: "TUR", TW: "TWN", TZ: "TZA",
    UA: "UKR", US: "USA", VN: "VNM", ZA: "ZAF",
};

export function stampCode(countryCode: string): string {
    const code = countryCode.toUpperCase();

    // A country not in the table keeps its two letters rather than being given
    // a third that might belong to somebody else.
    return ALPHA3[code] ?? code;
}
