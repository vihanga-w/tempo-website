"use client";

import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";

/**
 * The real leaderboard on invented data. Development only.
 *
 * Here to look at the avatars: they draw a colour blob until the picture
 * arrives, and the only way to know a placeholder looks like an out-of-focus
 * face rather than a grey lump is to see it. The pictures are pointed at a host
 * that never answers, so the placeholder is what stays on screen.
 */

import { useEffect, useState } from "react";
import LeaderboardPage from "@/components/leaderboard-page";
import { API_URL } from "@/lib/const";

/**
 * Three 4x4 grids of the sort of colours a photograph reduces to: 48 bytes of
 * base64, exactly what the server sends.
 *
 * Made up rather than taken from a real account. Random base64 renders as grey
 * mush and tells you nothing about whether the placeholder reads as a face out
 * of focus, which is the whole reason to look at this page.
 */
const BLOBS = [
    "xJZ4zqKDvIxulm5Y0qiK5L6gyJt8nnRcqn5kxph6tIZqhGBMeFhGjGhSflxIYEY4",
    "Wm6WboSwYHaeRlh4eJC8lrDWgJjCWGySZHqifpbAbIKqTF6AQFBuUGKERlZ0NEBY",
    "WHhgaI5wXoBmRF5McJh4irSSdp5+VHJcYIJoeJ6AZopuSGRQQFhITmpWRF5MMkY6",
];

const NAMES = ["Vonga", "Sorcha", "dylan", "Luke", "Vidhu", "Ricky2009"];

function board() {
    return {
        error: false,
        data: {
            periodStart: 0,
            periodEnd: 0,
            entries: NAMES.map((displayName, i) => ({
                userId: `u${i}`,
                displayName,
                // A host that never answers, so the placeholder is what shows
                imageUrl: i === 4 ? undefined : `https://never.invalid/pic${i}.jpg`,
                imageColourBlob: i === 5 ? undefined : BLOBS[i % BLOBS.length],
                listeningMs: (6 - i) * 3600e3,
                uniqueSongs: (6 - i) * 12,
                position: i + 1,
                isViewer: i === 2,
            })),
        },
    };
}

export default function DevLeaderboard() {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const real = window.fetch.bind(window);

        window.fetch = (async (input: any, init?: any) => {
            const url = typeof input === "string" ? input : input?.url ?? "";

            if (url.startsWith(`${API_URL}/me/leaderboard`)) {
                return new Response(JSON.stringify(board()), {
                    status: 200, headers: { "Content-Type": "application/json" },
                });
            }

            return real(input, init);
        }) as typeof window.fetch;

        setReady(true);

        return () => { window.fetch = real; };
    }, []);

    const user = { getAuthHeaders: () => ({}) } as any;

    return (
        <div style={{ background: "#0D0D0E", minHeight: "100vh", paddingTop: 8 }}>
            {ready && <LeaderboardPage user={user} />}
        </div>
    );
}
