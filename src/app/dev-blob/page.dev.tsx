"use client";

import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";

/**
 * A bench for the profile picture placeholder. Development only.
 *
 * Every row is one picture: the real thing, the blob the server would send for
 * it, and the two at the size they are actually drawn at. The blobs here are
 * produced by the same reduction the API performs — sharp resize to 4x4,
 * removeAlpha, raw, base64 — so what is on screen is what would be shipped.
 */

import { colourBlobToBackground } from "@/lib/colour-blob";

const PAGE_BG = "#0D0D0E";

const SAMPLES: { file: string; label: string; blob: string }[] = [
    {
        file: "art-inrainbows.jpg",
        label: "Radiohead — In Rainbows",
        blob: "NUA5PUhJkmpDmWRFJzExj15F2XdBe0AlRjojxXY2uHkpPS8OMiYqejM1Zi8oJBoc",
    },
    {
        file: "art-ram.jpg",
        label: "Daft Punk — Random Access Memories",
        blob: "ExYXHCAlFhgaBwsMHyMmbHmNLy0wGBcUISYpUVplMiwgIR8YAQUHP0RFRkAvAwcJ",
    },
    {
        file: "art-afterhours.jpg",
        label: "The Weeknd — After Hours",
        blob: "YGxdOz0zQEI4c4NyWmRYPx8OVTQgNDoxMDMkOR8PTi8YKSgaOzAfEg4LFRAKS0Ev",
    },
    {
        file: "art-tpab.jpg",
        label: "Kendrick Lamar — To Pimp a Butterfly",
        blob: "2NjX5ubl4N/gwcDBoJ6esbCws7Kzm5mbcm9vaGVlXltbXVtbdnNyXVxbXlxcZ2Rl",
    },
    {
        file: "art-depcherry.jpg",
        label: "Beach House — Depression Cherry",
        blob: "cRQecBEadhUeeRYiZwkSaAoSbg0Scg8VagsVawwUbQ0TagwTZwoUZQoTZQoTYgkS",
    },
];

/** The sizes the app actually draws a picture at. */
const SIZES = [56, 36, 15];

function Swatch({ blob, size, radius }: { blob: string; size: number; radius: number }) {
    const background = colourBlobToBackground(blob);

    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: radius,
                flexShrink: 0,
                backgroundImage: background,
                // Nothing to show is worth showing as nothing, not as black
                outline: background ? "none" : "1px dashed #333",
            }}
        />
    );
}

export default function DevBlobPage() {
    return (
        <div style={{ background: PAGE_BG, minHeight: "100vh", padding: 28, fontFamily: "Inter, sans-serif", color: "#f6f5f8" }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>
                Profile picture placeholder
            </h1>
            <p style={{ fontSize: 13, color: "#9d9aa6", marginBottom: 26, maxWidth: 720, lineHeight: 1.5 }}>
                The picture, then the 48 bytes the server sends for it, then the two side by side
                at the sizes the app draws them.
            </p>

            <div style={{ display: "grid", gap: 12 }}>
                {SAMPLES.filter(s => s.blob !== "").map(sample => (
                    <div
                        key={sample.file}
                        style={{
                            display: "grid",
                            gridTemplateColumns: "120px 120px 1fr",
                            gap: 22,
                            alignItems: "center",
                            background: "#151517",
                            borderRadius: 18,
                            padding: 16,
                        }}
                    >
                        <div>
                            <div style={{ fontSize: 10, color: "#65626e", marginBottom: 6 }}>the picture</div>
                            <img
                                src={`/art/${sample.file}`}
                                width={110}
                                height={110}
                                style={{ borderRadius: 14, display: "block" }}
                                alt=""
                            />
                        </div>

                        <div>
                            <div style={{ fontSize: 10, color: "#65626e", marginBottom: 6 }}>its 48 bytes</div>
                            <Swatch blob={sample.blob} size={110} radius={14} />
                        </div>

                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{sample.label}</div>

                            {/* At the sizes it is really used, placeholder above picture */}
                            <div style={{ display: "flex", gap: 18, alignItems: "flex-end" }}>
                                {SIZES.map(size => (
                                    <div key={size} style={{ display: "grid", gap: 6, justifyItems: "center" }}>
                                        <Swatch blob={sample.blob} size={size} radius={Math.round(size / 3.5)} />
                                        <img
                                            src={`/art/${sample.file}`}
                                            width={size}
                                            height={size}
                                            style={{ borderRadius: Math.round(size / 3.5), display: "block" }}
                                            alt=""
                                        />
                                        <div style={{ fontSize: 10, color: "#65626e" }}>{size}px</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
