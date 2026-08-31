"use client";

import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";

/**
 * The real Passport page, on invented data. Development only.
 *
 * Not a mock of the page — the page itself, with `fetch` answered locally and a
 * stubbed account. Everything on it before this had to be checked on a phone,
 * which is how a globe painted under an opaque scrim and a paragraph at two
 * thirds width both got as far as a device.
 *
 * The states are the ones worth looking at: the first week, when there is
 * almost nothing; a full page; and no destination at all, which is what most
 * listeners see until MusicBrainz has caught up with them.
 */

import { useEffect, useState } from "react";
import PassportPage from "@/components/passport-page";
import { API_URL } from "@/lib/const";

const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 1, 12);

const COUNTRIES = [
    { countryCode: "NL", name: "Netherlands", lat: 52.1, lon: 5.3, continent: "Europe", stampCount: 1 },
    { countryCode: "AU", name: "Australia", lat: -25.3, lon: 133.8, continent: "Oceania", stampCount: 2 },
    { countryCode: "CA", name: "Canada", lat: 56.1, lon: -106.3, continent: "North America", stampCount: 1 },
    { countryCode: "GB", name: "United Kingdom", lat: 54.0, lon: -2.5, continent: "Europe", stampCount: 6 },
    { countryCode: "US", name: "United States", lat: 39.5, lon: -98.5, continent: "North America", stampCount: 4 },
];

function payload(state: string) {
    const countries = state === "early" ? COUNTRIES.slice(0, 2) : COUNTRIES;

    const stamps = countries.map((c, i) => ({
        ...c, month: "2026-08", earnedAt: NOW - ((i + 1) * 2 * DAY),
    }));

    const closeTo = [
        { countryCode: "FR", name: "France", have: 2, need: 3, path: "artists" },
        { countryCode: "IE", name: "Ireland", have: 2, need: 3, path: "artists" },
        { countryCode: "JM", name: "Jamaica", have: 1, need: 3, path: "days" },
    ];

    return {
        error: false,
        data: {
            passport: {
                stamps,
                countries: countries.map((c, i) => ({
                    ...c, firstAt: NOW - (30 * DAY), lastAt: NOW - ((i + 1) * 2 * DAY),
                })),
                totalStamps: countries.reduce((n, c) => n + c.stampCount, 0),
                totalCountries: countries.length,
                closeTo: state === "early" ? closeTo.slice(0, 1) : closeTo,
                unplacedPlays: 12,
                placedPlays: 480,
            },
            destination: state === "nodest" ? null : {
                countryCode: "FR",
                name: "France",
                lat: 46.2,
                lon: 2.2,
                why: "Consider France, where you can discover IAM, Jul and Rohff alongside "
                    + "the hip hop, trap, pop and contemporary R&B you already enjoy from DJ Snake.",
                bridge: { artistId: "b1", name: "DJ Snake" },
                fresh: [
                    { artistId: "mb:1", name: "IAM" },
                    { artistId: "mb:2", name: "Jul" },
                    { artistId: "mb:3", name: "Rohff" },
                ],
            },
            pendingArtists: state === "early" ? 247 : 0,
        },
    };
}

const STATES = [["full", "Full page"], ["early", "First week"], ["nodest", "No destination"]];

export default function DevPassportPage() {
    const [state, setState] = useState("full");
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const real = window.fetch.bind(window);

        window.fetch = (async (input: any, init?: any) => {
            const url = typeof input === "string" ? input : input?.url ?? "";

            if (url.startsWith(`${API_URL}/me/passport`)) {
                return new Response(JSON.stringify(payload(state)), {
                    status: 200, headers: { "Content-Type": "application/json" },
                });
            }

            return real(input, init);
        }) as typeof window.fetch;

        setReady(true);

        return () => { window.fetch = real; };
    }, [state]);

    const user = { getAuthHeaders: () => ({}) } as any;

    return (
        <div style={{ background: "#0D0D0E", minHeight: "100vh" }}>
            <div style={{
                // Bottom left, over the globe's empty ocean: at the top they
                // sat on the card and the stamps heading.
                position: "fixed", bottom: 10, left: 10,
                zIndex: 99999, display: "flex", gap: 5,
            }}>
                {STATES.map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => setState(id)}
                        style={{
                            background: state === id ? "#2A2340" : "#131313",
                            border: `1px solid ${state === id ? "#A480FF" : "#2E2E33"}`,
                            color: state === id ? "#A480FF" : "#8B8B8B",
                            borderRadius: 999, padding: "4px 10px", fontSize: 10, cursor: "pointer",
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Remounted per state so the page refetches rather than caching the first answer */}
            {ready && <PassportPage key={state} user={user} />}
        </div>
    );
}
