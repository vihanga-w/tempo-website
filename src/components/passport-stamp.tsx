import { Box } from "@chakra-ui/react";
import { useMemo } from "react";
import {
    stampDesign, stampDate, stampCode, shiftHue, StampDesign, StampFrame,
} from "@/lib/stamp-design";

/**
 * One impression in the passport.
 *
 * Built from the parts a real stamp is built from rather than from the idea of
 * one: the country curved over the top between two rules, the authority curved
 * under the bottom reading the right way up, the date ruled off across the
 * middle the way a date wheel prints it, and a small pictogram for how you
 * arrived. Which frame and which decorations a country gets is decided in
 * stamp-design.ts by hashing the country, so it is the same everywhere and never
 * changes.
 *
 * Everything is stroked, never filled, and the outline is broken by a dash
 * pattern. A stamp is ink pressed through a worn rubber die, and a perfect
 * vector outline is the single thing that most gives away a drawn one.
 */

const VIEW = 100;
const C = VIEW / 2;

/**
 * The rows every stamp is set on.
 *
 * Shared by all nine frames, with each frame drawn large enough to contain
 * them. Sizing the content to the frame instead meant four numbers guessed per
 * shape, and the date crossed the outline on half of them.
 */
const ROW = { name: 25, code: 52, date: 67, foot: 80 };

/** Where the lettering ring sits. An ellipse is shorter than it is wide. */
const ARC_RADIUS: { [key in StampFrame]?: number } = {
    circle: 34, scallop: 32, oval: 30, arch: 30,
};

/** The arc the authority is set on, low enough to clear the date. */
const FOOT_RADIUS: { [key in StampFrame]?: number } = {
    circle: 34, scallop: 32, oval: 29,
};

function FrameShape({
    frame, stroke, width, inset, dash,
}: {
    frame: StampFrame;
    stroke: string;
    width: number;
    inset: number;
    dash?: string;
}) {
    const r = (VIEW / 2) - inset;
    const common = {
        fill: "none",
        stroke,
        strokeWidth: width,
        strokeDasharray: dash === "none" ? undefined : dash,
    };

    switch (frame) {
        case "circle":
            return <circle cx={C} cy={C} r={r} {...common} />;

        case "oval":
            return <ellipse cx={C} cy={C} rx={r} ry={r * 0.9} {...common} />;

        case "rect":
        case "rectBox":
            return (
                <rect
                    x={inset} y={inset + 4}
                    width={VIEW - inset * 2} height={VIEW - (inset * 2) - 8}
                    rx={3} {...common}
                />
            );

        case "hexagon": {
            const pts = Array.from({ length: 6 }, (_, i) => {
                const a = (Math.PI / 3) * i - Math.PI / 2;

                return `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
            });

            return <polygon points={pts.join(" ")} {...common} />;
        }

        case "octagon": {
            const pts = Array.from({ length: 8 }, (_, i) => {
                const a = (Math.PI / 4) * i - Math.PI / 8;

                return `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
            });

            return <polygon points={pts.join(" ")} {...common} />;
        }

        case "scallop": {
            // A serrated edge, cut the way a postage stamp is
            const teeth = 30;
            const path: string[] = [];

            for (let i = 0; i <= teeth; i++) {
                const a = (Math.PI * 2 * i) / teeth - Math.PI / 2;
                const wobble = (i % 2 === 0) ? r : r - 2.2;

                path.push(
                    `${i === 0 ? "M" : "L"}${(C + wobble * Math.cos(a)).toFixed(2)},`
                    + `${(C + wobble * Math.sin(a)).toFixed(2)}`,
                );
            }

            return <path d={`${path.join(" ")} Z`} {...common} strokeLinejoin="round" />;
        }

        case "arch": {
            const top = inset + 3;
            const bottom = VIEW - inset - 5;
            const left = inset + 1;
            const right = VIEW - inset - 1;

            return (
                <path
                    d={`M${left},${bottom} L${left},${C} `
                        + `A${(right - left) / 2},${C - top} 0 0 1 ${right},${C} `
                        + `L${right},${bottom} Z`}
                    {...common} strokeLinejoin="round"
                />
            );
        }

        case "cushion":
        default:
            return (
                <rect
                    x={inset + 1} y={inset + 1}
                    width={VIEW - (inset + 1) * 2} height={VIEW - (inset + 1) * 2}
                    rx={20} {...common}
                />
            );
    }
}

/** How you arrived. A plane on a real stamp; here, the music. */
function Glyph({ glyph, colour, y }: { glyph: StampDesign["glyph"]; colour: string; y: number }) {
    if (glyph === "none")
        return null;

    const stroke = { stroke: colour, fill: "none", strokeWidth: 1 };

    if (glyph === "record")
        return (
            <g {...stroke}>
                <circle cx={C} cy={y} r={3.8} />
                <circle cx={C} cy={y} r={1} />
            </g>
        );

    if (glyph === "note")
        return (
            <g {...stroke}>
                <circle cx={C - 2} cy={y + 2} r={2.1} />
                <path d={`M${C + 0.1},${y + 2} L${C + 0.1},${y - 3.6}`} strokeLinecap="round" />
                <path d={`M${C + 0.1},${y - 3.6} L${C + 4.2},${y - 2.4}`} strokeLinecap="round" />
            </g>
        );

    return (
        <path
            d={`M${C - 5.5},${y} q2.7,-3.6 5.5,0 t5.5,0`}
            {...stroke} strokeLinecap="round"
        />
    );
}

export default function PassportStamp({
    countryCode,
    countryName,
    earnedAt,
    colour,
    count,
    port,
    size = "100%",
}: Readonly<{
    countryCode: string;
    countryName: string;
    /** When the stamp was earned. 0 for a country not yet visited. */
    earnedAt: number;
    colour: string;
    /** Repeat visits, shown as a tally rather than as duplicate impressions. */
    count?: number;
    /** The way in — the city the artists came from. Falls back to the authority. */
    port?: string;
    size?: string;
}>) {
    const design = useMemo(
        () => stampDesign(countryCode, countryName),
        [countryCode, countryName],
    );

    const ink = useMemo(
        () => shiftHue(colour, design.hueShift),
        [colour, design.hueShift],
    );

    const code = stampCode(countryCode);
    const date = earnedAt > 0 ? stampDate(earnedAt) : "NOT YET";
    const authority = (port || "TEMPO").toUpperCase();

    // Ids must be unique per instance, or every stamp on the page reuses the
    // first one's arc and they all take its curve.
    const key = `${countryCode}-${earnedAt || "none"}`;
    const arcR = ARC_RADIUS[design.frame] ?? 30;
    const footR = FOOT_RADIUS[design.frame] ?? 30;

    const name = countryName.length <= 20 ? countryName.toUpperCase() : code;
    const ring = design.layout === "ring";

    // A long name set at the size of a short one runs off the end of the arc it
    // is written on, or into the frame it is written across.
    const nameSize = name.length > 13 ? 5.6 : (name.length > 10 ? 6.3 : 7);
    const nameTracking = name.length > 13 ? 0.6 : (name.length > 10 ? 0.9 : 1.2);
    const dash = design.inkBreaks;

    return (
        <Box width={size} position="relative" lineHeight="0">
            <svg
                viewBox={`0 0 ${VIEW} ${VIEW}`}
                width="100%"
                style={{ transform: `rotate(${design.rotation}deg)`, overflow: "visible" }}
                role="img"
                aria-label={earnedAt > 0
                    ? `${countryName}, stamped ${stampDate(earnedAt)}`
                    : `${countryName}, not yet visited`}
            >
                <defs>
                    <path
                        id={`t-${key}`}
                        d={`M${C - arcR},${C} A${arcR},${arcR} 0 0 1 ${C + arcR},${C}`}
                        fill="none"
                    />
                    {/* Swept the other way, so the letters underneath stand up */}
                    <path
                        id={`b-${key}`}
                        d={`M${C - footR},${C} A${footR},${footR} 0 0 0 ${C + footR},${C}`}
                        fill="none"
                    />
                </defs>

                <g opacity={design.weight}>
                    <FrameShape frame={design.frame} stroke={ink} width={1.7} inset={4} dash={dash} />

                    {design.innerRule && (
                        <FrameShape
                            frame={design.frame} stroke={ink} width={0.6} inset={8.5} dash={dash}
                        />
                    )}

                    {design.frame === "rectBox" && (
                        <>
                            <rect
                                x={9} y={16} width={17} height={9} rx={1}
                                fill="none" stroke={ink} strokeWidth={0.6}
                            />
                            <text
                                x={17.5} y={22.6} fill={ink} fontSize="6" textAnchor="middle"
                                letterSpacing="0.6"
                                fontFamily="'IBM Plex Mono', ui-monospace, monospace"
                            >
                                {countryCode.toUpperCase()}
                            </text>
                        </>
                    )}

                    {ring ? (
                        <>
                            <text
                                fill={ink} fontSize={nameSize}
                                letterSpacing={nameTracking}
                                fontFamily="'IBM Plex Mono', ui-monospace, monospace"
                            >
                                <textPath href={`#t-${key}`} startOffset="50%" textAnchor="middle">
                                    {name}
                                </textPath>
                            </text>
                            <text
                                fill={ink} fontSize="5.6" opacity={0.85}
                                letterSpacing="1"
                                fontFamily="'IBM Plex Mono', ui-monospace, monospace"
                            >
                                <textPath href={`#b-${key}`} startOffset="50%" textAnchor="middle">
                                    {authority}
                                </textPath>
                            </text>
                        </>
                    ) : (
                        <text
                            x={C} y={design.frame === "rectBox" ? ROW.name + 8 : ROW.name}
                            fill={ink} fontSize={nameSize} letterSpacing={nameTracking}
                            textAnchor="middle"
                            fontFamily="'IBM Plex Mono', ui-monospace, monospace"
                        >
                            {name}
                        </text>
                    )}

                    <text
                        x={C} y={ROW.code}
                        fill={ink} fontSize="17" fontWeight="500" letterSpacing="1.3"
                        textAnchor="middle"
                        fontFamily="'IBM Plex Mono', ui-monospace, monospace"
                    >
                        {code}
                    </text>

                    {/* The date, ruled off the way a date wheel prints between two lines */}
                    {design.dateBand && (
                        <>
                            <path
                                d={`M${C - 19},${ROW.date - 7} L${C + 19},${ROW.date - 7}`}
                                stroke={ink} strokeWidth={0.5} opacity={0.7}
                            />
                            <path
                                d={`M${C - 19},${ROW.date + 2.8} L${C + 19},${ROW.date + 2.8}`}
                                stroke={ink} strokeWidth={0.5} opacity={0.7}
                            />
                        </>
                    )}

                    <text
                        x={C} y={ROW.date}
                        fill={ink} fontSize="5.8" letterSpacing="0.7"
                        textAnchor="middle"
                        fontFamily="'IBM Plex Mono', ui-monospace, monospace"
                    >
                        {date}
                    </text>

                    {!ring && <Glyph glyph={design.glyph} colour={ink} y={ROW.foot} />}
                </g>
            </svg>

            {(count ?? 0) > 1 && (
                <Box
                    position="absolute"
                    top="-2px"
                    right="-2px"
                    background="#0D0D0E"
                    border={`1px solid ${ink}`}
                    color={ink}
                    borderRadius="full"
                    fontFamily="'IBM Plex Mono', monospace"
                    fontSize="9px"
                    lineHeight="15px"
                    height="16px"
                    paddingX="4px"
                >
                    {`x${count}`}
                </Box>
            )}
        </Box>
    );
}
