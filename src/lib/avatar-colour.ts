/**
 * The look of a profile picture that does not exist.
 *
 * Seeded on the account id and nothing else. Seeding on the name meant the same
 * person came out a different colour wherever the app shows a username rather
 * than a display name, which defeats the point of a stable colour — you are
 * meant to recognise somebody by it before you have read anything.
 */

/**
 * Chosen rather than generated. A hue spun off a hash lands anywhere, including
 * the bright, fully saturated end that fights everything else on a near black
 * page. These are all dark enough to sit on it quietly, with a light ink that
 * stays readable at fifteen pixels.
 */
const AVATAR_COLOURS: { from: string; to: string; ink: string }[] = [
    { from: "#3a2f5e", to: "#272044", ink: "#c9b8f0" },
    { from: "#2b4a5c", to: "#1e3542", ink: "#a5d0ec" },
    { from: "#2f5145", to: "#213a32", ink: "#a2dcc4" },
    { from: "#5a3a3a", to: "#402929", ink: "#f0b3b3" },
    { from: "#54432a", to: "#3c301e", ink: "#ecc999" },
    { from: "#453056", to: "#31223d", ink: "#d6b0ee" },
    { from: "#2e3f5c", to: "#212d42", ink: "#adc2ea" },
    { from: "#4d3350", to: "#38253a", ink: "#e2aee6" },
    { from: "#354a3a", to: "#25352a", ink: "#b0d9b8" },
    { from: "#4a3a2c", to: "#352a20", ink: "#e0bd9b" },
];

export interface AvatarColour {
    from: string;
    to: string;
    ink: string;
    /** Ready to hand to a background, so callers do not repeat the gradient. */
    gradient: string;
}

/**
 * A stable colour for an account.
 *
 * Any hash would do; this one only has to spread ids evenly and give the same
 * answer every time, on every device.
 */
export function avatarColour(userId: string): AvatarColour {
    let hash = 0;

    for (let i = 0; i < userId.length; i++)
        hash = (Math.imul(hash, 31) + userId.charCodeAt(i)) >>> 0;

    const colour = AVATAR_COLOURS[hash % AVATAR_COLOURS.length];

    return { ...colour, gradient: `linear-gradient(150deg, ${colour.from} 0%, ${colour.to} 100%)` };
}

/** The letter to show. Falls back to something rather than an empty square. */
export function avatarInitial(displayName?: string): string {
    const trimmed = (displayName ?? "").trim();

    // Array.from, so a name beginning with an emoji or a surrogate pair is not
    // cut in half into an unrenderable fragment
    return (trimmed === "" ? "?" : Array.from(trimmed)[0].toUpperCase());
}
