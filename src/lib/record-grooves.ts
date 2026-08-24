/**
 * Where the separation bands fall on a given record.
 *
 * The bands are the coarse silent gaps cut between tracks, and they are the rings
 * you can actually pick out on a record by eye. Their spacing is a property of
 * the record: how many tracks are on the side and how long each one runs. A
 * fixed set of radii means every record on the page is pressed identically,
 * which is the sort of thing nobody consciously notices and everybody feels.
 *
 * Seeded from the track id so a given record always looks like itself — the same
 * song returns to the same pressing on every render, on every reload, and on
 * everybody's screen — while a different one is laid out differently.
 */

/** FNV-1a. Small, stable, and not a security boundary — this picks groove radii. */
function hash(value: string): number {
    let h = 2166136261;

    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }

    return h >>> 0;
}

/** mulberry32: a tiny deterministic PRNG, so the same id gives the same record. */
function random(seed: number): () => number {
    let a = seed;

    return () => {
        a = (a + 0x6D2B79F5) | 0;

        let t = Math.imul(a ^ (a >>> 15), 1 | a);

        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Radii for one record's separation bands, as percentages of its own radius.
 *
 * `inner` and `outer` bound the music, so the bands can never land in the dead
 * wax or out in the lead-in where a real record has no tracks to separate.
 */
export function separationsFor(songId: string, inner = 39.7, outer = 96.7): number[] {
    if (songId === "")
        return [];

    const next = random(hash(songId));

    // Three to six tracks a side, which is most records
    const count = 3 + Math.floor(next() * 4);

    const span = outer - inner;

    // Tracks are not the same length, so the gaps between the bands are not
    // even. Weighted rather than evenly divided, and kept within a factor of
    // about two so no track ends up a sliver
    const weights = Array.from({ length: count + 1 }, () => 0.6 + next() * 0.8);
    const total = weights.reduce((sum, weight) => sum + weight, 0);

    // The first band is held clear of the run-out, and the last of the lead-in
    const usable = span * 0.88;

    let at = inner + span * 0.06;

    return weights.slice(0, count).map(weight => {
        at += (weight / total) * usable;

        return Math.round(at * 100) / 100;
    });
}

/**
 * Where the grooves themselves fall, as percentages of the record's radius.
 *
 * Evenly spaced rings are the giveaway. A side is cut with variable pitch — the
 * lathe opens the spacing out where the music is loud and closes it up where it
 * is quiet — so the banding on a real record tightens and loosens all the way
 * across, and that unevenness is most of what makes it read as a recording
 * rather than as a pattern.
 *
 * Seeded from the same track id as the separations, so a record's grooves and
 * its track breaks belong to each other.
 */
export function grooveRingsFor(songId: string, inner = 39.7, outer = 96.7): number[] {
    const next = random(hash(songId + ":grooves"));

    const rings: number[] = [];

    // The real pitch is some three thousand turns and averages to flat grey, so
    // this is exaggerated — and a little wider than looks "right" standing
    // still, because banding this coarse is what makes the disc read as turning
    // rather than as a static texture
    const PITCH = 4.4;

    let at = inner + 0.8;

    while (at < outer) {
        rings.push(Math.round(at * 100) / 100);

        // Loud passages take more room than quiet ones, and no two stretches of
        // a side are the same
        at += PITCH * (0.62 + next() * 0.76);
    }

    return rings;
}
