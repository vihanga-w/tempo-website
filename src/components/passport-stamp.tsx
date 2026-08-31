import { Box } from "@chakra-ui/react";
import { useMemo } from "react";
import {
    stampDesign, stampDate, stampCode, StampDesign, StampFrame,
} from "@/lib/stamp-design";

/**
 * One impression in the passport.
 *
 * Drawn rather than typed, because the shapes are the point: eight frames, a
 * curve of text where the frame has a curved top, a code in the middle and a
 * date under it. Which one a country gets is decided in stamp-design.ts by
 * hashing the country, so it is the same everywhere and never changes.
 *
 * Everything is stroked in one colour and left slightly transparent. A stamp is
 * ink pressed into paper, not a filled icon, and the moment it becomes a solid
 * shape it reads as a badge from a different app.
 */

const VIEW = 100;
const C = VIEW / 2;

/** The outline for a frame, as an SVG path or shape element. */
function FrameShape({
    frame, stroke, width, inset,
}: {
    frame: StampFrame;
    stroke: string;
    width: number;
    inset: number;
}) {
    const r = (VIEW / 2) - inset;
    const common = { fill: "none", stroke, strokeWidth: width };

    switch (frame) {
        case "circle":
            return <circle cx={C} cy={C} r={r} {...common} />;

        case "oval":
            return <ellipse cx={C} cy={C} rx={r} ry={r * 0.76} {...common} />;

        case "rect":
            return (
                <rect
                    x={inset} y={inset + r * 0.16}
                    width={VIEW - inset * 2} height={(VIEW - inset * 2) * 0.68}
                    rx={4} {...common}
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
            // A serrated edge, cut the way a postage stamp is: a ring of small
            // arcs rather than a smooth circle.
            const teeth = 28;
            const path: string[] = [];

            for (let i = 0; i <= teeth; i++) {
                const a = (Math.PI * 2 * i) / teeth - Math.PI / 2;
                const wobble = (i % 2 === 0) ? r : r - 2.4;

                path.push(
                    `${i === 0 ? "M" : "L"}${(C + wobble * Math.cos(a)).toFixed(2)},`
                    + `${(C + wobble * Math.sin(a)).toFixed(2)}`,
                );
            }

            return <path d={`${path.join(" ")} Z`} {...common} strokeLinejoin="round" />;
        }

        case "arch": {
            // Flat along the bottom, domed over the top
            const top = inset + 4;
            const bottom = VIEW - inset - 6;
            const left = inset + 2;
            const right = VIEW - inset - 2;

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
                    x={inset + 2} y={inset + 2}
                    width={VIEW - (inset + 2) * 2} height={VIEW - (inset + 2) * 2}
                    rx={22} {...common}
                />
            );
    }
}

/** The little "how you arrived" mark. Music, not aviation. */
function Glyph({
    design, colour, y,
}: {
    design: StampDesign;
    colour: string;
    /** Sits a fixed distance above the date, whatever height the frame put it at. */
    y: number;
}) {
    if (design.glyph === "none")
        return null;

    if (design.glyph === "record")
        return (
            <g stroke={colour} fill="none" strokeWidth={1.1}>
                <circle cx={C} cy={y} r={4.4} />
                <circle cx={C} cy={y} r={1.1} />
            </g>
        );

    if (design.glyph === "note")
        return (
            <g stroke={colour} fill="none" strokeWidth={1.1}>
                <circle cx={C - 2.2} cy={y + 2.4} r={2.4} />
                <path d={`M${C + 0.2},${y + 2.4} L${C + 0.2},${y - 4}`} strokeLinecap="round" />
                <path d={`M${C + 0.2},${y - 4} L${C + 4.6},${y - 2.6}`} strokeLinecap="round" />
            </g>
        );

    return (
        <path
            d={`M${C - 6},${y} q3,-4 6,0 t6,0`}
            stroke={colour} fill="none" strokeWidth={1.1} strokeLinecap="round"
        />
    );
}

export default function PassportStamp({
    countryCode,
    countryName,
    month,
    colour,
    count,
    size = "100%",
}: Readonly<{
    countryCode: string;
    countryName: string;
    /** "2026-08". Empty for a stamp not yet earned. */
    month: string;
    colour: string;
    /** Repeat visits, shown as a small tally rather than duplicate stamps. */
    count?: number;
    size?: string;
}>) {
    const design = useMemo(
        () => stampDesign(countryCode, countryName),
        [countryCode, countryName],
    );

    const code = stampCode(countryCode);
    const date = month ? stampDate(month) : "NOT YET";

    // Ids must be unique per instance or one stamp's arc path is reused by every
    // other stamp on the page, and they all take the first one's curve.
    const arcId = `arc-${countryCode}-${month || "none"}`;

    // Radius of the curve the name is set on. Per frame, because an oval is
    // shorter than it is wide and a dome shorter still: one shared radius sat
    // the name outside the very outline it was supposed to follow.
    const ARC_RADIUS: { [key: string]: number } = {
        circle: 32, scallop: 30, oval: 22, arch: 27,
    };

    const arcR = ARC_RADIUS[design.frame] ?? 30;

    // An ellipse curves away under the date and a dome has more room below it,
    // so the baseline follows the frame rather than sitting at one height.
    const DATE_Y: { [key: string]: number } = { oval: 74, arch: 84 };
    const dateY = DATE_Y[design.frame] ?? 80;


    // A name too long for the arc is dropped rather than squashed illegibly.
    const name = countryName.length <= 18 ? countryName.toUpperCase() : "";

    // A long name set at the same size as a short one runs into the frame it is
    // written across. Ten characters fits comfortably; past that it tightens.
    const straightSize = name.length > 12 ? 6.4 : (name.length > 9 ? 7 : 7.5);
    const straightTracking = name.length > 12 ? 0.85 : 1.4;

    return (
        <Box width={size} position="relative" lineHeight="0">
            <svg
                viewBox={`0 0 ${VIEW} ${VIEW}`}
                width="100%"
                style={{ transform: `rotate(${design.rotation}deg)`, overflow: "visible" }}
                role="img"
                aria-label={month
                    ? `${countryName}, stamped ${stampDate(month)}`
                    : `${countryName}, not yet visited`}
            >
                <defs>
                    <path
                        id={arcId}
                        d={`M${C - arcR},${C} A${arcR},${arcR} 0 0 1 ${C + arcR},${C}`}
                        fill="none"
                    />
                </defs>

                <g opacity={0.92}>
                    <FrameShape frame={design.frame} stroke={colour} width={1.8} inset={7} />

                    {design.innerRule && (
                        <FrameShape frame={design.frame} stroke={colour} width={0.7} inset={11.5} />
                    )}

                    {name !== "" && design.layout === "arc" && (
                        <text
                            fill={colour}
                            fontSize="7.5"
                            letterSpacing="1.2"
                            fontFamily="'IBM Plex Mono', ui-monospace, monospace"
                        >
                            <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
                                {name}
                            </textPath>
                        </text>
                    )}

                    {name !== "" && design.layout === "straight" && (
                        <text
                            x={C} y={28}
                            fill={colour}
                            fontSize={straightSize}
                            letterSpacing={straightTracking}
                            textAnchor="middle"
                            fontFamily="'IBM Plex Mono', ui-monospace, monospace"
                        >
                            {name}
                        </text>
                    )}

                    <text
                        x={C} y={design.glyph === "none" ? 55 : 51}
                        fill={colour}
                        fontSize="19"
                        fontWeight="500"
                        letterSpacing="1.5"
                        textAnchor="middle"
                        fontFamily="'IBM Plex Mono', ui-monospace, monospace"
                    >
                        {code}
                    </text>

                    {design.underline && (
                        <path
                            d={`M${C - 14},${design.glyph === "none" ? 60 : 56} L${C + 14},${design.glyph === "none" ? 60 : 56}`}
                            stroke={colour} strokeWidth={0.7} opacity={0.7}
                        />
                    )}

                    <Glyph design={design} colour={colour} y={dateY - 12} />

                    <text
                        x={C} y={dateY}
                        fill={colour} fontSize="7" letterSpacing="1.3"
                        textAnchor="middle" opacity={0.85}
                        fontFamily="'IBM Plex Mono', ui-monospace, monospace"
                    >
                        {date}
                    </text>
                </g>
            </svg>

            {(count ?? 0) > 1 && (
                <Box
                    position="absolute"
                    top="-2px"
                    right="-2px"
                    background="#0D0D0E"
                    border={`1px solid ${colour}`}
                    color={colour}
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
