"use client";

import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";

/**
 * A bench for the passport visuals. Development only — not linked from the app.
 *
 * The stamps are picked by hashing the country, so the only way to know the set
 * looks right is to lay a lot of them out side by side and check that no two
 * neighbours collide, that the frames are actually varied, and that long country
 * names do not break the arc. The globe is here for the same reason: it needs
 * looking at against real coastlines, not described.
 */

import { useState } from "react";
import PassportStamp from "@/components/passport-stamp";
import PassportGlobe from "@/components/passport-globe";
import { stampDesign } from "@/lib/stamp-design";

const ACCENT = "#A480FF";
const GOLD = "#E3B341";

const AUG = Date.UTC(2026, 7, 4);
const DAY = 86400000;

const COUNTRIES: [string, string, string][] = [
    ["NG", "Nigeria", "2026-08"], ["GB", "United Kingdom", "2026-08"],
    ["US", "United States", "2026-08"], ["KR", "South Korea", "2026-07"],
    ["SE", "Sweden", "2026-07"], ["JP", "Japan", "2026-07"],
    ["BR", "Brazil", "2026-06"], ["ZA", "South Africa", "2026-06"],
    ["JM", "Jamaica", "2026-05"], ["FR", "France", "2026-05"],
    ["IS", "Iceland", "2026-04"], ["ML", "Mali", "2026-04"],
    ["DE", "Germany", "2026-03"], ["CA", "Canada", "2026-03"],
    ["NL", "Netherlands", "2026-02"], ["IE", "Ireland", "2026-02"],
    ["ES", "Spain", "2026-01"], ["AU", "Australia", "2026-01"],
    ["GH", "Ghana", "2026-01"], ["CO", "Colombia", "2025-12"],
    ["IN", "India", "2025-12"], ["NZ", "New Zealand", "2025-11"],
    ["PT", "Portugal", "2025-11"], ["TR", "Turkey", "2025-10"],
];

const PINS = COUNTRIES.slice(0, 12).map((_, i) => ({
    lat: [9, 54, 39, 36, 60, 36, -14, -30, 18, 46, 65, 17][i],
    lon: [8, -2, -98, 128, 18, 138, -52, 23, -77, 2, -19, -4][i],
    weight: (i % 5) + 1,
}));

export default function DevPassport() {
    const [target, setTarget] = useState({ lat: 9.1, lon: 8.7 });

    const frames = new Map<string, string[]>();

    for (const [code, name] of COUNTRIES) {
        const { frame } = stampDesign(code, name);

        frames.set(frame, [...(frames.get(frame) ?? []), code]);
    }

    return (
        <div style={{
            background: "#0D0D0E", color: "#E9E7FB", minHeight: "100vh",
            fontFamily: "Inter, sans-serif", padding: "24px",
        }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Passport bench</h1>
            <p style={{ fontSize: 13, color: "#6B6B6B", marginBottom: 20 }}>
                Frame spread: {[...frames.entries()].map(([f, c]) => `${f}(${c.length})`).join("  ")}
            </p>

            <div style={{
                display: "grid", gridTemplateColumns: "repeat(6, 1fr)",
                gap: "14px 10px", maxWidth: 720, marginBottom: 34,
            }}>
                {COUNTRIES.map(([code, name, month], i) => (
                    <PassportStamp
                        key={code}
                        countryCode={code}
                        countryName={name}
                        earnedAt={AUG - (i * 11 * DAY)}
                        colour={ACCENT}
                        count={i % 4 === 0 ? (i % 7) + 2 : undefined}
                    />
                ))}
            </div>

            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Not yet visited</h2>
            <div style={{
                display: "grid", gridTemplateColumns: "repeat(6, 1fr)",
                gap: "14px 10px", maxWidth: 720, marginBottom: 34,
            }}>
                {COUNTRIES.slice(0, 6).map(([code, name]) => (
                    <PassportStamp
                        key={`n-${code}`}
                        countryCode={code}
                        countryName={name}
                        earnedAt={0}
                        colour={GOLD}
                    />
                ))}
            </div>

            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Globe</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {[["Lagos", 9.1, 8.7], ["Seoul", 35.9, 127.8], ["Sao Paulo", -14.2, -51.9],
                  ["Reykjavik", 64.9, -19]].map(([label, lat, lon]) => (
                    <button
                        key={label as string}
                        onClick={() => setTarget({ lat: lat as number, lon: lon as number })}
                        style={{
                            background: "#131313", border: "1px solid #2E2E33", color: "#C9C6D6",
                            borderRadius: 999, padding: "6px 14px", fontSize: 12, cursor: "pointer",
                        }}
                    >
                        {label as string}
                    </button>
                ))}
            </div>

            {/* Sized as the page sizes it, so the arc here is the arc there */}
            <div style={{
                position: "relative", height: 226, width: 390, border: "1px solid #1E1E1E",
                borderRadius: 18, overflow: "hidden", background: "#0D0D0E",
            }}>
                <PassportGlobe pins={PINS} target={target} height={226} pinned={false} />
            </div>
        </div>
    );
}
