"use client";

import { Box } from "@chakra-ui/react";
import { useEffect, useRef } from "react";

/**
 * The globe at the bottom of the passport.
 *
 * Drawn on a 2D canvas rather than in three.js. Lanyard needs react-three-fiber
 * because it needs a physics engine; a globe needs a projection and some lines,
 * and the canvas version starts cold on a phone in a fraction of the time.
 *
 * Geography is real — Natural Earth 110m, loaded once from /map/globe.json. An
 * earlier version drew a lat-long grid and some pins, which looked like a globe
 * and meant nothing: a pin says nothing unless you can see it is on the Niger
 * delta. Coastlines and borders are lines rather than filled shapes because half
 * the world is behind the sphere, and clipping a filled polygon at the horizon
 * needs arcs walked along the limb and gets the interior wrong when it fails. A
 * line just stops when it goes over the edge. Land dots have the same property.
 *
 * Colour carries the one distinction that matters: everything Natural Earth
 * draws is neutral ink at three weights, and colour is reserved for things that
 * are true about the listener.
 */

const RAD = Math.PI / 180;

/** Where the destination sits on the visible arc, as a fraction of the radius. */
const LIFT_FRACTION = 0.83;
const LIFT_DEGREES = Math.asin(LIFT_FRACTION) / RAD;

const FLY_MS = 1700;

/**
 * How the sphere sits relative to the band it is drawn in.
 *
 * Wider than the screen and centred well below it, so what shows is an arc of
 * something large rather than a small ball. Exported because the page has to
 * agree: the scrim that dissolves text into the globe is concentric with this
 * sphere, and the space kept clear at the foot of the page is measured from it.
 * Both were separately hard-coded to the same two numbers once, and that is
 * exactly how they come to disagree.
 */
export const GLOBE_RADIUS_RATIO = 0.98;

/**
 * How far below the band's foot the sphere's centre sits, as a fraction of its
 * radius -- not a pixel count.
 *
 * The radius scales with the screen, so a fixed drop does not: the same number
 * that gives a good horizon on a 390pt phone left a 320pt one with a 73px
 * sliver and the destination pin 94% of the way down it. Expressed against the
 * radius, the visible arc is always 0.37R and the pin always lands in the same
 * place, whatever the screen.
 */
export const GLOBE_CENTRE_DROP_RATIO = 0.63;

/** How long the globe holds still after arriving before it drifts again. */
const HOLD_MS = 2800;

export interface GlobePin {
    lat: number;
    lon: number;
    /** Stamps held there, which sets the size. */
    weight: number;
}

interface MapData {
    q: number;
    coast: number[][];
    border: number[][];
    dotQ: number;
    dots: number[];
}

interface Line {
    x: Float32Array;
    y: Float32Array;
    z: Float32Array;
    n: number;
}

/**
 * One shared load for the whole app.
 *
 * The file is static and never changes, so a second visit to the tab must not
 * fetch it again — and under Capacitor it is read straight out of the app
 * bundle rather than over the network.
 */
let mapPromise: Promise<MapData> | null = null;

function loadMap(): Promise<MapData> {
    if (!mapPromise) {
        mapPromise = fetch("/map/globe.json")
            .then(r => {
                if (!r.ok)
                    throw new Error(`map ${r.status}`);

                return r.json();
            })
            .catch(ex => {
                // Cleared so a failed load can be retried by the next mount
                // rather than being cached as a permanent failure.
                mapPromise = null;

                throw ex;
            });
    }

    return mapPromise;
}

function unit(lon: number, lat: number): [number, number, number] {
    const f = lat * RAD;
    const l = lon * RAD;
    const c = Math.cos(f);

    return [c * Math.sin(l), Math.sin(f), c * Math.cos(l)];
}

/** Every point's position on the unit sphere, computed once at load. */
function buildLines(list: number[][], q: number): Line[] {
    return list.map(enc => {
        const n = enc.length / 2;
        const x = new Float32Array(n);
        const y = new Float32Array(n);
        const z = new Float32Array(n);

        let lon = 0;
        let lat = 0;

        for (let i = 0; i < n; i++) {
            if (i === 0) {
                lon = enc[0];
                lat = enc[1];
            } else {
                lon += enc[i * 2];
                lat += enc[i * 2 + 1];
            }

            const v = unit(lon / q, lat / q);

            x[i] = v[0];
            y[i] = v[1];
            z[i] = v[2];
        }

        return { x, y, z, n };
    });
}

export default function PassportGlobe({
    pins,
    target,
    height = 226,
    pinColour = "#A480FF",
    targetColour = "#E3B341",
    pinned = true,
}: Readonly<{
    pins: GlobePin[];
    /** Where to spin to. Null leaves it turning where it is. */
    target: { lat: number; lon: number } | null;
    height?: number;
    pinColour?: string;
    targetColour?: string;
    /**
     * Whether the horizon belongs to the screen or to its container.
     *
     * The page wants it fixed to the bottom of the viewport. The development
     * bench wants it inside a box it can put next to other things, and without
     * this the bench's globe escaped its frame and covered the page.
     */
    pinned?: boolean;
}>) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pinsRef = useRef(pins);
    const targetRef = useRef(target);

    // The draw loop lives inside an effect that must not be torn down when the
    // destination changes, so the effect hands its flyTo out through a ref for
    // the destination effect below to call.
    const flyToRef = useRef<((to: { lat: number; lon: number } | null) => void) | null>(null);

    // The draw loop reads these rather than closing over them, so new props do
    // not tear down and rebuild the canvas.
    useEffect(() => { pinsRef.current = pins; }, [pins]);

    useEffect(() => {
        const canvas = canvasRef.current;

        if (!canvas)
            return;

        const ctx = canvas.getContext("2d");

        if (!ctx)
            return;

        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        let coast: Line[] = [];
        let border: Line[] = [];
        let dots: Line | null = null;
        let buckets: Float32Array[] = [];

        let W = 0;
        let H = 0;
        let R = 0;
        let cx = 0;
        let cy = 0;

        let yaw = 0;
        let pitch = 0;
        let fromYaw = 0;
        let fromPitch = 0;
        let toYaw = 0;
        let toPitch = 0;
        let animT = 1;
        let holdUntil = 0;

        let cosY = 1;
        let sinY = 0;
        let cosP = 1;
        let sinP = 0;

        let raf: number | null = null;
        let inView = true;
        let visible = !document.hidden;
        let cancelled = false;

        function resize() {
            const rect = canvas!.getBoundingClientRect();
            // Phones report a device pixel ratio of 3; uncapped that is nine
            // times the pixels for a difference nobody can see.
            const dpr = Math.min(window.devicePixelRatio || 1, 2);

            W = rect.width;
            H = rect.height;
            canvas!.width = Math.round(W * dpr);
            canvas!.height = Math.round(H * dpr);
            ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Wider than the screen and centred well below it, so what shows is
            // an arc of a large sphere rather than a small ball.
            R = W * GLOBE_RADIUS_RATIO;
            cx = W / 2;
            cy = H + (R * GLOBE_CENTRE_DROP_RATIO);
        }

        function strokeLines(set: Line[], style: string, width: number) {
            ctx!.beginPath();

            for (const line of set) {
                let first = true;

                for (let i = 0; i < line.n; i++) {
                    const z1 = -line.x[i] * sinY + line.z[i] * cosY;
                    const zz = line.y[i] * sinP + z1 * cosP;

                    if (zz <= 0) {
                        first = true;
                        continue;
                    }

                    const sx = cx + (line.x[i] * cosY + line.z[i] * sinY) * R;
                    const sy = cy - (line.y[i] * cosP - z1 * sinP) * R;

                    if (first) {
                        ctx!.moveTo(sx, sy);
                        first = false;
                    } else {
                        ctx!.lineTo(sx, sy);
                    }
                }
            }

            ctx!.strokeStyle = style;
            ctx!.lineWidth = width;
            ctx!.lineJoin = "round";
            ctx!.lineCap = "round";
            ctx!.stroke();
        }

        function project(lat: number, lon: number) {
            const v = unit(lon, lat);
            const z1 = -v[0] * sinY + v[2] * cosY;

            return {
                x: cx + (v[0] * cosY + v[2] * sinY) * R,
                y: cy - (v[1] * cosP - z1 * sinP) * R,
                z: v[1] * sinP + z1 * cosP,
            };
        }

        /*
         * Land fades out before the limb rather than being drawn up to it.
         *
         * Orthographic projection puts a point at angular distance t from the
         * centre at R*sin(t) from the middle, so near the edge sin barely moves:
         * everything between 78 and 90 degrees out lands in the last three per
         * cent of the radius. Drawn at full weight that is a few hundred dots
         * stacked into five pixels -- a solid ring that follows no coastline,
         * which is what made the continents look like they leaked into the sea.
         *
         * Cutting them at 0.22 costs the outer 2.5% of the disc, which nobody
         * can see is missing, and the two faint bands before it mean the cut
         * itself has no visible edge.
         */
        const BAND_MIN = 0.22;
        const BAND_INK = [
            "rgba(233,231,251,0.105)",
            "rgba(233,231,251,0.062)",
            "rgba(233,231,251,0.028)",
        ];

        function draw(now: number) {
            const a = yaw * RAD;
            const b = pitch * RAD;

            cosY = Math.cos(a);
            sinY = Math.sin(a);
            cosP = Math.cos(b);
            sinP = Math.sin(b);

            ctx!.clearRect(0, 0, W, H);

            // The one gradient here, and it is doing a job: a sphere with no
            // falloff reads as a flat disc.
            const shade = ctx!.createRadialGradient(cx, cy - R * 0.42, R * 0.02, cx, cy, R);

            shade.addColorStop(0, "#191722");
            shade.addColorStop(0.72, "#131218");
            shade.addColorStop(1, "#0E0E11");

            ctx!.beginPath();
            ctx!.arc(cx, cy, R, 0, Math.PI * 2);
            ctx!.fillStyle = shade;
            ctx!.fill();

            ctx!.save();
            ctx!.beginPath();
            ctx!.arc(cx, cy, R, 0, Math.PI * 2);
            ctx!.clip();

            if (dots) {
                // Bucketed by depth in one pass, so fillStyle is set three times
                // a frame rather than once per dot.
                const counts = [0, 0, 0];

                for (let i = 0; i < dots.n; i++) {
                    const z1 = -dots.x[i] * sinY + dots.z[i] * cosY;
                    const zz = dots.y[i] * sinP + z1 * cosP;

                    if (zz <= BAND_MIN)
                        continue;

                    const sy = cy - (dots.y[i] * cosP - z1 * sinP) * R;

                    if (sy > H + 4 || sy < -4)
                        continue;

                    const band = zz > 0.55 ? 0 : (zz > 0.35 ? 1 : 2);
                    const k = counts[band]++;

                    buckets[band][k * 2] = cx + (dots.x[i] * cosY + dots.z[i] * sinY) * R;
                    buckets[band][k * 2 + 1] = sy;
                }

                for (let band = 0; band < 3; band++) {
                    ctx!.fillStyle = BAND_INK[band];

                    for (let k = 0; k < counts[band]; k++)
                        ctx!.fillRect(buckets[band][k * 2] - 0.65, buckets[band][k * 2 + 1] - 0.65, 1.3, 1.3);
                }
            }

            strokeLines(border, "rgba(233,231,251,0.042)", 0.6);
            strokeLines(coast, "rgba(233,231,251,0.125)", 0.8);
            ctx!.restore();

            const marks = pinsRef.current.map(p => ({
                pt: project(p.lat, p.lon),
                weight: p.weight,
                isTarget: false,
            }));

            const t = targetRef.current;

            if (t)
                marks.push({ pt: project(t.lat, t.lon), weight: 3, isTarget: true });

            marks.sort((m, n) => m.pt.z - n.pt.z);

            for (const mark of marks) {
                if (mark.pt.z <= 0.02 || mark.pt.y > H + 30)
                    continue;

                const fade = Math.min(1, mark.pt.z * 1.9);
                const colour = mark.isTarget ? targetColour : pinColour;
                const glow = mark.isTarget
                    ? "rgba(227,179,65,0.26)"
                    : "rgba(164,128,255,0.20)";

                const pulse = (mark.isTarget && !reduced)
                    ? 1 + Math.sin(now / 430) * 0.22
                    : 1;

                const r = mark.isTarget
                    ? 3.9 * pulse
                    : 1.7 + Math.min(mark.weight, 8) * 0.32;

                ctx!.globalAlpha = fade;

                ctx!.beginPath();
                ctx!.arc(mark.pt.x, mark.pt.y, r * 2.8, 0, Math.PI * 2);
                ctx!.fillStyle = glow;
                ctx!.fill();

                ctx!.beginPath();
                ctx!.arc(mark.pt.x, mark.pt.y, r, 0, Math.PI * 2);
                ctx!.fillStyle = colour;
                ctx!.fill();

                ctx!.globalAlpha = 1;
            }
        }

        function frame(now: number) {
            if (animT < 1) {
                animT = Math.min(1, animT + 16.7 / FLY_MS);

                const e = animT < 0.5
                    ? 4 * animT * animT * animT
                    : 1 - Math.pow(-2 * animT + 2, 3) / 2;

                yaw = fromYaw + (toYaw - fromYaw) * e;
                pitch = fromPitch + (toPitch - fromPitch) * e;

                if (animT === 1)
                    holdUntil = now + HOLD_MS;
            } else if (!reduced && now > holdUntil) {
                yaw += 0.026;
            }

            draw(now);

            raf = requestAnimationFrame(frame);
        }

        // Runs only when the tab is front AND the globe is on screen. Either
        // alone still leaves a phone spinning a canvas nobody is looking at.
        function sync() {
            if (cancelled)
                return;

            if (inView && visible) {
                if (raf === null)
                    raf = requestAnimationFrame(frame);
            } else if (raf !== null) {
                cancelAnimationFrame(raf);
                raf = null;
            }
        }

        function flyTo(to: { lat: number; lon: number } | null) {
            if (!to)
                return;

            fromYaw = yaw;
            fromPitch = pitch;

            const want = -to.lon;
            // The short way round, or the globe takes the scenic route across
            // the Pacific to reach Lagos.
            const delta = (((want - yaw + 180) % 360) + 360) % 360 - 180;

            toYaw = yaw + delta;
            toPitch = to.lat - LIFT_DEGREES;

            if (reduced) {
                yaw = toYaw;
                pitch = toPitch;
                animT = 1;
            } else {
                animT = 0;
            }

            // Paint once straight away. A backgrounded tab is never given an
            // animation frame, so without this a globe that changed destination
            // while hidden would still be showing the old one on return.
            draw(0);
        }

        flyToRef.current = flyTo;

        const onResize = () => { resize(); draw(0); };
        const onVisibility = () => { visible = !document.hidden; sync(); };

        window.addEventListener("resize", onResize);
        document.addEventListener("visibilitychange", onVisibility);

        const observer = ("IntersectionObserver" in window)
            ? new IntersectionObserver(entries => {
                inView = entries[0].isIntersecting;
                sync();
            }, { threshold: 0 })
            : null;

        observer?.observe(canvas);

        loadMap().then(data => {
            if (cancelled)
                return;

            coast = buildLines(data.coast, data.q);
            border = buildLines(data.border, data.q);

            const n = data.dots.length / 2;
            const x = new Float32Array(n);
            const y = new Float32Array(n);
            const z = new Float32Array(n);

            for (let i = 0; i < n; i++) {
                const v = unit(data.dots[i * 2] / data.dotQ, data.dots[i * 2 + 1] / data.dotQ);

                x[i] = v[0];
                y[i] = v[1];
                z[i] = v[2];
            }

            dots = { x, y, z, n };
            buckets = [
                new Float32Array(n * 2), new Float32Array(n * 2), new Float32Array(n * 2),
            ];

            resize();
            flyTo(targetRef.current);
            // One frame immediately, so the globe is there before the loop is
            // allowed to run — a backgrounded tab never gets an animation frame.
            draw(0);
            sync();
        }).catch(ex => console.warn("Could not load the globe map:", ex));

        resize();

        return () => {
            cancelled = true;
            flyToRef.current = null;

            if (raf !== null)
                cancelAnimationFrame(raf);

            window.removeEventListener("resize", onResize);
            document.removeEventListener("visibilitychange", onVisibility);
            observer?.disconnect();
        };
    }, [pinColour, targetColour]);

    // Changing destination spins the globe rather than rebuilding it. The ref
    // is what the draw loop reads; the call is what makes it actually move --
    // updating the ref alone left the globe pointing wherever it first landed.
    useEffect(() => {
        targetRef.current = target;
        flyToRef.current?.(target);
    }, [target]);

    return (
        <Box
            // Fixed rather than absolute on the page: the horizon belongs to the
            // bottom of the screen, not to the bottom of a scrolling column.
            // Above the scrim either way, so the sphere is never painted over by
            // the fade that hides the text.
            position={pinned ? "fixed" : "absolute"}
            left="0"
            right="0"
            bottom="0"
            height={`${height}px`}
            zIndex={3}
        >
            <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
        </Box>
    );
}
