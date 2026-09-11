import { afterEach, describe, expect, it, vi } from "vitest";
import {
    endOf,
    fieldAt,
    fizzle,
    HOT_ALPHA,
    makeField,
    makeParticles,
    particleState,
    SWEEP_MS,
    type Point,
} from "./fizzle";

/**
 * The dust at the end of a menu choice.
 *
 * What can be seen is judged by looking. What these pin is what cannot: that
 * the row comes apart unevenly rather than as a wipe, that each mote lifts
 * from its own patch at that patch's moment, and above all that every mote
 * dies — the canvas the dust is drawn on sits over the whole app, and is only
 * taken down once the last one has gone.
 */

const INK = [233, 231, 251] as const;

/** `n` points in a line across a row `width` wide. */
const line = (n: number, width = 200): Point[] =>
    Array.from({ length: n }, (_, i) => ({ x: (i / (n - 1)) * width, y: 10, color: INK }));

/** Always the middle of the range, which makes the jitter vanish. */
const middle = () => 0.5;

/** A small seeded generator, so a real spread is the same every run. */
function seeded(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe("the field a row comes apart along", () => {
    /** About the size of a menu row: label and button, 230 by 52. */
    const field = makeField(230, 52, seeded(11));
    const moments = Array.from(field.at);

    it("gives every patch its own moment, spread evenly from first to last", () => {
        const sorted = [...moments].sort((a, b) => a - b);

        expect(sorted[0]).toBe(0);
        expect(sorted.at(-1)).toBe(1);
        // Even spacing is what keeps the row losing the same amount each frame.
        const gaps = sorted.slice(1).map((v, i) => v - sorted[i]);
        expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1e-6);
    });

    it("is not a wipe: when a patch goes has nothing to do with where it is across the row", () => {
        const xs = moments.map((_, i) => i % field.cols);
        const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
        const mx = mean(xs);
        const mm = mean(moments);
        const cov = mean(xs.map((x, i) => (x - mx) * (moments[i] - mm)));
        const sx = Math.sqrt(mean(xs.map((x) => (x - mx) ** 2)));
        const sm = Math.sqrt(mean(moments.map((m) => (m - mm) ** 2)));

        expect(Math.abs(cov / (sx * sm))).toBeLessThan(0.15);
    });

    it("comes apart in patches rather than as static: neighbours go at nearer moments than strangers", () => {
        const rand = seeded(3);
        let near = 0;
        let far = 0;
        let pairs = 0;

        for (let r = 0; r < field.rows; r++) {
            for (let c = 0; c + 1 < field.cols; c++) {
                const i = r * field.cols + c;
                near += Math.abs(moments[i] - moments[i + 1]);
                far += Math.abs(moments[i] - moments[Math.floor(rand() * moments.length)]);
                pairs++;
            }
        }

        expect(near / pairs).toBeLessThan((far / pairs) * 0.9);
    });

    it("answers for points just outside the row with the nearest patch", () => {
        expect(fieldAt(field, -5, -5)).toBe(field.at[0]);
        expect(fieldAt(field, 10_000, 10_000)).toBe(field.at[field.at.length - 1]);
    });
});

describe("the dust", () => {
    it("lifts each mote at the moment its patch goes", () => {
        const when = (pt: Point) => pt.x / 200;
        const delays = makeParticles(line(5), when, middle).map(p => p.delay);

        expect(delays).toEqual([0, 0.25, 0.5, 0.75, 1].map(f => f * SWEEP_MS));
    });

    it("shows nothing of a mote before its moment", () => {
        const [, p] = makeParticles(line(3), pt => pt.x / 200, middle);

        expect(particleState(p, p.delay - 1)).toBeNull();
        expect(particleState(p, p.delay)).not.toBeNull();
    });

    it("releases every mote as a faint glint, well short of white", () => {
        const [p] = makeParticles(line(2), () => 0, middle);

        expect(particleState(p, p.delay)).toMatchObject({ hot: true, alpha: HOT_ALPHA });
        expect(HOT_ALPHA).toBeLessThan(0.5);
    });

    it("drifts upward, the way dust leaves", () => {
        const [p] = makeParticles(line(2), () => 0, middle);
        const early = particleState(p, p.delay + 100)!;
        const later = particleState(p, p.delay + 200)!;

        expect(later.y).toBeLessThan(early.y);
    });

    it("lets every mote die, so the canvas always comes down", () => {
        const field = makeField(240, 52, seeded(7));
        const points = line(300, 240);
        const particles = makeParticles(points, pt => fieldAt(field, pt.x, pt.y), seeded(9));
        const end = endOf(particles);

        expect(particles.every(p => particleState(p, end) === null)).toBe(true);
        // And not a moment sooner: the last mote is still up just before.
        expect(particles.some(p => particleState(p, end - 1) !== null)).toBe(true);
    });
});

describe("fizzle", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.innerHTML = "";
    });

    it("does nothing without a row to dissolve", () => {
        expect(() => fizzle(null)).not.toThrow();
        expect(document.querySelector("canvas")).toBeNull();
    });

    it("leaves the row alone for someone who has asked for less motion", () => {
        vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));

        const row = document.createElement("div");
        row.append(document.createElement("p"), document.createElement("div"));
        document.body.appendChild(row);

        fizzle(row);

        // No drawing, and the row's own label and button untouched: it leaves
        // the plain way, with the rest of the menu.
        expect(document.querySelector("canvas")).toBeNull();
        for (const child of Array.from(row.children) as HTMLElement[]) {
            expect(child.style.visibility).toBe("");
            expect(child.style.opacity).toBe("");
        }
    });
});
