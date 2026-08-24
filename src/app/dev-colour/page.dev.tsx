"use client";

import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";

/**
 * A bench for the artwork colour picker. Development only — not linked from the
 * app, and it exists so the reactive colour can be checked against real covers
 * rather than against one placeholder.
 *
 * It runs the real functions the profile page paints itself with, and puts the
 * old averaging next to the dominant-colour extraction that replaced it.
 */

import { useEffect, useState } from "react";
import {
    apcaLc,
    averageArtworkColour,
    dominantArtworkColour,
    extractArtworkColour,
    PAGE_BG,
    panelFill,
    readableAccent,
    type Rgb,
} from "@/lib/artwork-colour";

const COVERS: { file: string; label: string; why: string }[] = [
    { file: "art-inrainbows.jpg", label: "Radiohead — In Rainbows", why: "saturated, many hues" },
    { file: "art-afterhours.jpg", label: "The Weeknd — After Hours", why: "saturated red" },
    { file: "art-depcherry.jpg", label: "Beach House — Depression Cherry", why: "flat deep red" },
    { file: "art-blonde.jpg", label: "Frank Ocean — Novacane", why: "warm, low chroma" },
    { file: "art-ram.jpg", label: "Daft Punk — Random Access Memories", why: "very dark, gold subject" },
    { file: "art-nevermind.jpg", label: "Nevermind (violin)", why: "deep red-brown" },
    { file: "art-tpab.jpg", label: "Kendrick Lamar — To Pimp a Butterfly", why: "greyscale — should stay white" },
];

interface Variant {
    source: Rgb;
    ink: string;
    panel: string;
    inkLc: number;
    panelLc: number;
}

interface Row {
    file: string;
    label: string;
    why: string;
    average: Variant;
    dominant: Variant;
    vibrant: Variant;
}

function build(source: Rgb): Variant {
    const ink = readableAccent(source);
    const panel = panelFill(source);

    return {
        source,
        ink,
        panel,
        inkLc: apcaLc(ink, PAGE_BG),
        panelLc: apcaLc("#ffffff", panel),
    };
}

function Swatch({ variant, title }: { variant: Variant; title: string }) {
    return (
        <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 10, color: "#65626e", textTransform: "none" }}>{title}</div>

            <div style={{ display: "flex", gap: 6 }}>
                {/* What the source colour actually is */}
                <div
                    style={{
                        width: 34,
                        height: 58,
                        borderRadius: 8,
                        flexShrink: 0,
                        background: `rgb(${variant.source.r},${variant.source.g},${variant.source.b})`,
                    }}
                    title={`rgb(${variant.source.r}, ${variant.source.g}, ${variant.source.b})`}
                />

                {/* Ink on the page */}
                <div style={{ background: PAGE_BG, borderRadius: 8, padding: "8px 10px", minWidth: 116 }}>
                    <div style={{ color: variant.ink, fontSize: 18, fontWeight: 800, letterSpacing: "-0.04em" }}>4h 12m</div>
                    <div style={{ fontSize: 10, color: "#65626e", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                        {variant.ink} · Lc {variant.inkLc.toFixed(0)}
                    </div>
                </div>

                {/* The now playing panel */}
                <div style={{ background: variant.panel, borderRadius: 8, padding: "8px 10px", minWidth: 116 }}>
                    <div style={{ color: "#ffffff", fontSize: 13, fontWeight: 700 }}>Now spinning</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                        {variant.panel} · Lc {variant.panelLc.toFixed(0)}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function DevColourPage() {
    const [rows, setRows] = useState<Row[]>([]);

    useEffect(() => {
        Promise.all(COVERS.map(async cover => {
            const src = `/art/${cover.file}`;

            const averaged = await averageArtworkColour(src);
            const dominant = await dominantArtworkColour(src);
            const vibrant = await extractArtworkColour(src);

            if (!averaged || !dominant || !vibrant)
                return null;

            return {
                ...cover,
                average: build(averaged),
                dominant: build(dominant),
                vibrant: build(vibrant),
            } satisfies Row;
        })).then(r => setRows(r.filter(Boolean) as Row[]));
    }, []);

    return (
        <div style={{ background: PAGE_BG, minHeight: "100vh", padding: "28px", fontFamily: "Inter, sans-serif", color: "#f6f5f8" }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>
                Artwork colour picker
            </h1>
            <p style={{ fontSize: 13, color: "#9d9aa6", marginBottom: 24, maxWidth: 760, lineHeight: 1.5 }}>
                The same readableAccent and panelFill the profile page uses, over real covers.
                Left is the average of every pixel, which is what the page used to paint itself
                from. Middle is the most common colour. Right is what the page uses now: the
                most common colour among the vivid ones. Lc is APCA — ink on the page wants 60,
                white on the panel wants 75.
            </p>

            <div style={{ display: "grid", gap: 10 }}>
                {rows.map(row => (
                    <div
                        key={row.file}
                        style={{
                            display: "grid",
                            gridTemplateColumns: "68px 150px 1fr 1fr 1fr",
                            gap: 18,
                            alignItems: "center",
                            background: "#151517",
                            borderRadius: 18,
                            padding: 14,
                        }}
                    >
                        <img src={`/art/${row.file}`} width={68} height={68} style={{ borderRadius: 6, display: "block" }} alt="" />

                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>{row.label}</div>
                            <div style={{ fontSize: 11, color: "#65626e", marginTop: 3 }}>{row.why}</div>
                        </div>

                        <Swatch variant={row.average} title="average of every pixel (was)" />
                        <Swatch variant={row.dominant} title="most common colour" />
                        <Swatch variant={row.vibrant} title="vibrancy weighted (now)" />
                    </div>
                ))}
            </div>
        </div>
    );
}
