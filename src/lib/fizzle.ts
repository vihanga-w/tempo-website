/**
 * A row turning to dust.
 *
 * The last thing a chosen menu row does: it comes apart. Not from one end to
 * the other — a front sweeping across reads as a wipe, however soft its edge —
 * but everywhere at once and unevenly, the way something fizzles: patches go
 * first, their edges crackle, and the last few specks hang on a moment longer.
 *
 * That unevenness comes from a noise field laid over the row. Every two-pixel
 * patch gets its own moment to go, from a blend of soft blotches (so it fails
 * in organic patches) and fine grain (so those patches have ragged edges).
 *
 * The label is taken over by a drawing of itself — the same text, in its own
 * font and colour, on the dust canvas — and that drawing is what the field eats
 * away, a patch at a time. Where a patch goes, a mote of dust lifts from it,
 * sampled from the same drawing, so what disperses is recognisably the word
 * that was chosen. The glass button, which cannot be drawn, fades while its rim
 * sheds dust.
 *
 * Why a drawing and not a mask on the real text: WebKit decodes CSS mask images
 * asynchronously, and a mask that has not loaded yet counts as fully
 * transparent. A new mask every frame is a mask that is almost never loaded,
 * and the text simply vanished at the first frame, leaving only the dust.
 * Canvas drawing has no such delay.
 *
 * It is tuned to the edge of noticing. The page arriving underneath is the
 * point; this only says where the choice went.
 *
 * The motion and the field are split from the drawing on purpose:
 * `makeField`, `makeParticles` and `particleState` are pure, which is what lets
 * the parts that would fail invisibly — a dissolve that has quietly become a
 * wipe again, a spark that never dies and keeps a full-screen canvas alive — be
 * tested without a screen.
 */

type Rgb = readonly [number, number, number];

export type Point = { x: number; y: number; color: Rgb };

export type Particle = {
    x0: number;
    y0: number;
    color: Rgb;
    /** When its patch of the row goes, in ms from the start. */
    delay: number;
    /** How long it lives once released, in ms. */
    life: number;
    /** Drift and rise, in px per second. */
    vx: number;
    vy: number;
    /** A sideways wander that grows as it rises, so the path is not a ruler line. */
    amp: number;
    wf: number;
    phase: number;
    /** Core radius at release, in px. */
    size: number;
    /** How fast it twinkles. */
    tw: number;
};

export type ParticleFrame = { x: number; y: number; size: number; alpha: number; hot: boolean };

/** The moment each patch of a row goes, as 0 (first) to 1 (last). */
export type Field = { cols: number; rows: number; cell: number; at: Float32Array };

/** The label and icon colour, so the dust is the colour of what it was. */
const LAVENDER: Rgb = [233, 231, 251];
/** The glint at the moment of release. */
const WHITE: Rgb = [255, 255, 255];
/** Tempo's accent, as the rarest of glints. */
const VIOLET: Rgb = [164, 128, 255];

/** How long the field takes to reach its last patch. */
export const SWEEP_MS = 520;

/**
 * How long a patch takes to fade once its moment comes, as a fraction of the
 * sweep. Enough that patches soften away rather than blink off.
 */
const SOFT = 0.12;

/**
 * When the row is entirely gone. The menu holds on until then, so nothing of
 * the row is still on screen when it closes; the dust outlives it.
 */
export const DISSOLVE_MS = Math.ceil(SWEEP_MS * (1 + SOFT)) + 20;

/** The grain of the field, in px: each patch is this size square. */
const CELL = 2;
/** The size of the blotches the grain gathers into, in px. */
const BLOTCH = 9;
/** How much of each patch's moment is blotch rather than grain. */
const BLOTCH_WEIGHT = 0.55;

/** The field decides when; this only keeps neighbouring motes from lifting in lockstep. */
const JITTER_MS = 30;
/** Fleeting: gone before the eye has quite settled on it. */
const LIFE_MIN_MS = 260;
const LIFE_SPREAD_MS = 260;
/** The glint at release: brief, no bigger than the mote, and faint. */
const HOT_MS = 30;
const HOT_SIZE = 1;
export const HOT_ALPHA = 0.35;

/**
 * How much of full strength the dust is drawn at — a little over a quarter.
 *
 * The aim is the edge of noticing: the row seems simply to fade, and only
 * afterwards does it occur to you that it might have glittered on the way. Any
 * brighter and it becomes an effect, which is the page arriving underneath
 * being upstaged by the thing that was supposed to be making way for it.
 */
const INTENSITY = 0.28;

/** How far each mote's glow reaches, as a multiple of its core. */
const GLOW = 1.8;
/** Dust rises. The faintest upward pull, in px per second squared. */
const BUOYANCY = -10;
/**
 * A ceiling, so a long label cannot turn into a frame-rate problem. Generous,
 * because fine dust needs more of it to read as a surface coming apart and each
 * mote costs almost nothing to draw.
 */
const MAX_PARTICLES = 600;

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The noise field for a row `width` by `height` px.
 *
 * Blotches come from value noise — random heights on a coarse lattice, smoothly
 * interpolated — and grain from a fresh random draw per patch. The blend is
 * then replaced by its rank: every patch's moment is its place in the order,
 * spread evenly from 0 to 1, so the row loses the same amount every frame
 * instead of lurching through the clumps a raw blend would have.
 */
export function makeField(width: number, height: number, rand: () => number): Field {
    const cols = Math.max(1, Math.ceil(width / CELL));
    const rows = Math.max(1, Math.ceil(height / CELL));

    const gx = Math.ceil(width / BLOTCH) + 2;
    const gy = Math.ceil(height / BLOTCH) + 2;
    const lattice = Float32Array.from({ length: gx * gy }, () => rand());
    const node = (i: number, j: number) => lattice[j * gx + i];

    const raw = new Float32Array(cols * rows);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const fx = (c * CELL) / BLOTCH;
            const fy = (r * CELL) / BLOTCH;
            const x0 = Math.floor(fx);
            const y0 = Math.floor(fy);
            const sx = smooth(fx - x0);
            const sy = smooth(fy - y0);

            const top = node(x0, y0) + (node(x0 + 1, y0) - node(x0, y0)) * sx;
            const bottom = node(x0, y0 + 1) + (node(x0 + 1, y0 + 1) - node(x0, y0 + 1)) * sx;
            const blotch = top + (bottom - top) * sy;

            raw[r * cols + c] = BLOTCH_WEIGHT * blotch + (1 - BLOTCH_WEIGHT) * rand();
        }
    }

    const n = raw.length;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => raw[a] - raw[b]);
    const at = new Float32Array(n);
    order.forEach((index, rank) => {
        at[index] = n > 1 ? rank / (n - 1) : 0;
    });

    return { cols, rows, cell: CELL, at };
}

/** The moment the patch under (`x`, `y`) goes, in px from the row's corner. */
export function fieldAt(field: Field, x: number, y: number): number {
    const c = Math.min(field.cols - 1, Math.max(0, Math.floor(x / field.cell)));
    const r = Math.min(field.rows - 1, Math.max(0, Math.floor(y / field.cell)));
    return field.at[r * field.cols + c];
}

/**
 * Motes for `points`, each released at `when(point)` of the way through the
 * dissolve — which is the moment its patch of the row goes.
 */
export function makeParticles(
    points: readonly Point[],
    when: (point: Point) => number,
    rand: () => number,
): Particle[] {
    return points.map((pt) => {
        const color = rand() < 0.03 ? VIOLET : pt.color;

        return {
            x0: pt.x,
            y0: pt.y,
            color,
            delay: Math.max(0, clamp01(when(pt)) * SWEEP_MS + (rand() - 0.5) * JITTER_MS),
            life: LIFE_MIN_MS + rand() * LIFE_SPREAD_MS,
            // Barely any drift: a lift of a few pixels, mostly up, as though
            // the row were evaporating in place rather than being blown away.
            // The row sits against the right edge, so what sideways motion there
            // is leans inward.
            vx: (rand() - 0.6) * 14,
            vy: -(6 + rand() * 16),
            amp: 0.5 + rand() * 0.8,
            wf: 5 + rand() * 6,
            phase: rand() * Math.PI * 2,
            size: 0.3 + rand() * 0.4,
            tw: 14 + rand() * 16,
        };
    });
}

/** Where a particle is at `t` ms, or null before its release and after its death. */
export function particleState(p: Particle, t: number): ParticleFrame | null {
    const local = t - p.delay;

    if (local < 0 || local >= p.life)
        return null;

    const u = local / p.life;
    const s = local / 1000;
    const hot = local < HOT_MS;
    const twinkle = 0.65 + 0.35 * Math.abs(Math.sin(p.phase + p.tw * s));

    return {
        x: p.x0 + p.vx * s + Math.sin(p.phase + p.wf * s) * p.amp * u,
        y: p.y0 + p.vy * s + 0.5 * BUOYANCY * s * s,
        size: p.size * (1 - 0.6 * u) * (hot ? HOT_SIZE : 1),
        alpha: hot ? HOT_ALPHA : Math.pow(1 - u, 1.5) * twinkle * INTENSITY,
        hot,
    };
}

/** When the last particle dies, in ms — which is when the canvas can go. */
export function endOf(particles: readonly Particle[]): number {
    return particles.reduce((end, p) => Math.max(end, p.delay + p.life), 0);
}

/** A drawing of a label, three times over for sharpness, and the ink in it. */
type Raster = { image: HTMLCanvasElement; rect: DOMRect; points: Point[] };

/** How many drawing pixels per CSS pixel the label is drawn at. */
const RASTER_SCALE = 3;

/**
 * Draw a label as it appears: its own font, size, letter-spacing and colour,
 * one character at a time so the spacing matches, and sat on its baseline by
 * the font's own metrics so the drawing lands where the text was. Then sample
 * the ink on a fine grid for the dust — a pixel and a half apart, so the word
 * comes apart as grain rather than as a handful of sparks.
 *
 * `text-transform` lives in CSS and never reaches the text itself, so the
 * capitals are applied here by hand.
 */
function rasterise(label: HTMLElement): Raster | null {
    const rect = label.getBoundingClientRect();

    if (!rect.width || !label.offsetWidth)
        return null;

    // The chosen row is scaled up while it is held; follow it.
    const scale = rect.width / label.offsetWidth;
    const S = RASTER_SCALE;
    const cs = getComputedStyle(label);

    const image = document.createElement("canvas");
    image.width = Math.ceil(rect.width * S);
    image.height = Math.ceil(rect.height * S);

    const ctx = image.getContext("2d");

    if (!ctx)
        return null;

    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize) * scale * S}px ${cs.fontFamily}`;
    ctx.fillStyle = cs.color || "rgb(233,231,251)";

    const text = [...(label.textContent ?? "").toUpperCase()];
    const spacing = (parseFloat(cs.letterSpacing) || 0) * scale * S;
    const widths = text.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * text.length;

    /*
     * The browser centres the font's own ascent and descent in the line, and
     * puts the baseline under the ascent. Where the metrics are unavailable,
     * the middle is close enough.
     */
    const metrics = ctx.measureText("M");
    const ascent = metrics.fontBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent;
    let y = image.height / 2;

    if (Number.isFinite(ascent) && Number.isFinite(descent)) {
        ctx.textBaseline = "alphabetic";
        y = image.height / 2 + (ascent - descent) / 2;
    } else {
        ctx.textBaseline = "middle";
    }

    let x = image.width - total;
    text.forEach((ch, i) => {
        ctx.fillText(ch, x, y);
        x += widths[i] + spacing;
    });

    const { data } = ctx.getImageData(0, 0, image.width, image.height);
    const step = Math.round(S * 1.5);
    const points: Point[] = [];

    for (let py = 0; py < image.height; py += step) {
        for (let px = 0; px < image.width; px += step) {
            if (data[(py * image.width + px) * 4 + 3] > 110)
                points.push({ x: rect.left + px / S, y: rect.top + py / S, color: LAVENDER });
        }
    }

    return { image, rect, points };
}

/**
 * The glass button, as points: its rim, which is the brightest thing about
 * it, and a small cloud where the icon sits. At twenty-one pixels the icon's
 * exact strokes would not survive the first frame of a dissolve anyway.
 */
function buttonPoints(button: HTMLElement): Point[] {
    const rect = button.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const R = rect.width / 2;
    const points: Point[] = [];

    const rim = Math.max(12, Math.round((2 * Math.PI * R) / 2));
    for (let i = 0; i < rim; i++) {
        const a = (i / rim) * Math.PI * 2;
        points.push({ x: cx + Math.cos(a) * (R - 0.8), y: cy + Math.sin(a) * (R - 0.8), color: LAVENDER });
    }

    const icon = Math.round(R * 1.1);
    for (let i = 0; i < icon; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * R * 0.4;
        points.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, color: LAVENDER });
    }

    return points;
}

function samplePoints(ink: Point[], button: HTMLElement | undefined): Point[] {
    const points = [...ink, ...(button ? buttonPoints(button) : [])];

    if (points.length <= MAX_PARTICLES)
        return points;

    // Thinned evenly, so a long label loses density rather than its ending.
    const stride = points.length / MAX_PARTICLES;
    return Array.from({ length: MAX_PARTICLES }, (_, k) => points[Math.floor(k * stride)]);
}

/** A soft glow, drawn once per colour and then stamped for every particle. */
function makeSprite([r, g, b]: Rgb): HTMLCanvasElement {
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 32;

    const ctx = sprite.getContext("2d");

    if (ctx) {
        const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        glow.addColorStop(0, `rgba(${r},${g},${b},1)`);
        glow.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`);
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, 32, 32);
    }

    return sprite;
}

/**
 * The label's drawing, eaten away as the field says.
 *
 * One pixel of mask per patch, redrawn each frame and stretched over the
 * drawing with smoothing on, so each patch softens at its edges rather than
 * leaving square holes. Returns a function that draws the label as it stands
 * at a given point in the dissolve.
 */
function makeDissolve(raster: Raster, row: DOMRect, field: Field) {
    const { rect, image } = raster;
    const cols = Math.max(1, Math.ceil(rect.width / field.cell));
    const rows = Math.max(1, Math.ceil(rect.height / field.cell));

    const mask = document.createElement("canvas");
    mask.width = cols;
    mask.height = rows;

    const work = document.createElement("canvas");
    work.width = image.width;
    work.height = image.height;

    const mctx = mask.getContext("2d");
    const wctx = work.getContext("2d");

    if (!mctx || !wctx)
        return null;

    const cells = mctx.createImageData(cols, rows);
    const moments = new Float32Array(cols * rows);

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            moments[y * cols + x] = fieldAt(
                field,
                rect.left - row.left + (x + 0.5) * field.cell,
                rect.top - row.top + (y + 0.5) * field.cell,
            );
        }
    }

    cells.data.fill(255);
    wctx.imageSmoothingEnabled = true;

    return (ctx: CanvasRenderingContext2D, progress: number) => {
        for (let i = 0; i < moments.length; i++)
            cells.data[i * 4 + 3] = 255 * clamp01((moments[i] + SOFT - progress) / SOFT);

        mctx.putImageData(cells, 0, 0);

        wctx.globalCompositeOperation = "copy";
        wctx.drawImage(image, 0, 0);
        wctx.globalCompositeOperation = "destination-in";
        wctx.drawImage(mask, 0, 0, work.width, work.height);

        ctx.globalAlpha = 1;
        ctx.drawImage(work, rect.left, rect.top, rect.width, rect.height);
    };
}

/** What fizzle hands back when it hid nothing, so there is nothing to put back. */
const NOTHING = () => {};

/**
 * Turn `target` to dust. Nothing waits on it, and it tidies up after itself,
 * with a timeout behind the animation in case frames stop arriving (a
 * backgrounded app) before the last mote has gone.
 *
 * Returns what puts the row back. The label and button it hides stay hidden
 * otherwise, and framer can bring the same row back rather than build a new
 * one: a menu reopened before its last exit had finished showed an empty slot
 * where this row had been.
 *
 * Does nothing for anyone who has asked for less motion; the row then leaves
 * the plain way, with the rest of the menu.
 */
export function fizzle(target: Element | null): () => void {
    if (typeof window === "undefined" || !(target instanceof HTMLElement))
        return NOTHING;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
        return NOTHING;

    const row = target.getBoundingClientRect();

    if (row.width === 0)
        return NOTHING;

    const [label, button] = Array.from(target.children) as HTMLElement[];
    const field = makeField(row.width, row.height, Math.random);
    const when = (pt: Point) => fieldAt(field, pt.x - row.left, pt.y - row.top);

    const raster = label instanceof HTMLElement ? rasterise(label) : null;
    const dissolve = raster ? makeDissolve(raster, row, field) : null;
    const particles = makeParticles(
        samplePoints(raster?.points ?? [], button instanceof HTMLElement ? button : undefined),
        when,
        Math.random,
    );

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx)
        return NOTHING;

    // Past 2x the dust looks no different and costs half as much again to fill.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    Object.assign(canvas.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: `${w}px`,
        height: `${h}px`,
        pointerEvents: "none",
        // Above the menu, which is itself above everything.
        zIndex: "1000000001",
    });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    document.body.appendChild(canvas);

    const sprites = new Map<Rgb, HTMLCanvasElement>();
    const sprite = (c: Rgb) => {
        let s = sprites.get(c);
        if (!s) {
            s = makeSprite(c);
            sprites.set(c, s);
        }
        return s;
    };

    const last = 1 + SOFT;
    const end = Math.max(endOf(particles), SWEEP_MS * last);
    const start = performance.now();
    let raf = 0;
    let safety: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    let handedOver = false;

    const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(raf);
        clearTimeout(safety);
        canvas.remove();
    };

    const restore = () => {
        // The dust goes too. Left running, it drew over the reopened menu, and a
        // second choice stacked another canvas on top of it.
        finish();

        // Too late for the first frame to hide anything, if it has yet to run.
        handedOver = true;

        if (label instanceof HTMLElement)
            label.style.visibility = "";

        if (button instanceof HTMLElement) {
            // Straight back, rather than faded in over the dissolve's length.
            button.style.transition = "";
            button.style.opacity = "";
        }
    };

    safety = setTimeout(finish, end + 1000);

    const frame = (now: number) => {
        const t = now - start;
        const progress = Math.min(last, t / SWEEP_MS);

        ctx.clearRect(0, 0, w, h);

        /*
         * The handover, on the first frame: the real label goes and its drawing
         * takes its place, in the same paint, so there is no frame with neither
         * and none with both. Visibility rather than opacity, because opacity on
         * the label is framer's to animate. The button fades over the dissolve.
         */
        if (!handedOver) {
            handedOver = true;

            if (dissolve && label instanceof HTMLElement)
                label.style.visibility = "hidden";

            if (button instanceof HTMLElement) {
                button.style.transition = `opacity ${Math.round(SWEEP_MS * last)}ms ease-in`;
                button.style.opacity = "0";
            }
        }

        if (dissolve && progress < last)
            dissolve(ctx, progress);

        for (const p of particles) {
            const f = particleState(p, t);

            if (!f)
                continue;

            const r = f.size * GLOW;
            ctx.globalAlpha = f.alpha;
            ctx.drawImage(sprite(f.hot ? WHITE : p.color), f.x - r, f.y - r, r * 2, r * 2);
        }

        if (t >= end)
            return finish();

        raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return restore;
}
