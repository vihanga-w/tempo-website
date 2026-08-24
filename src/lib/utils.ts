type Image = {
    height: number;
    url: string;
    width: number;
  };
  
export function findBestSCDNImageSize(
    images: Image[],
    targetWidth: number,
    targetHeight: number
): string | null {
    if (images.length === 0) return null;

    const penaltyMultiplier = 2;
    const slightUndersizeTolerance = 0.15;

    let bestImage: Image | null = null;
    let bestScore = Infinity;

    for (const image of images) {
        const widthDiff = image.width - targetWidth;
        const heightDiff = image.height - targetHeight;

        let score = Math.sqrt(widthDiff ** 2 + heightDiff ** 2);

        const widthTooSmall = image.width < targetWidth * (1 - slightUndersizeTolerance);
        const heightTooSmall = image.height < targetHeight * (1 - slightUndersizeTolerance);

        if (widthTooSmall || heightTooSmall) {
            score *= penaltyMultiplier;
        }

        if (score < bestScore) {
            bestScore = score;
            bestImage = image;
        }
    }

    return bestImage ? bestImage.url : null;
}
/**
 * A length of listening, written the way somebody would say it.
 *
 * "4h 12m", "38m", "—". Shared by the leaderboard and the profile so the same
 * seven days of listening cannot be quoted two different ways on two screens.
 */
export function formatListening(ms: number): string {
    const minutes = Math.round(ms / 60e3);

    // Nothing at all reads as nothing, rather than as a very short something
    if (ms <= 0)
        return "—";

    if (minutes < 1)
        return "under a minute";

    if (minutes < 60)
        return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    // "2h" is how somebody would say a round two hours. "2h 0m" is a stopwatch
    // reading of one, and puts a zero on the largest figure on the profile.
    if (remainder === 0)
        return `${hours}h`;

    // Padding the minutes lines a column up, but "1h 08m" is a stopwatch reading
    // rather than an amount of listening to anyone who has not spent their life
    // looking at zero padded numbers.
    return `${hours}h ${remainder}m`;
}

/**
 * The same length of listening, written out in full.
 *
 * "4h 12m" is right on a tile, where it sits under a label and next to other
 * figures and every character is doing work. In a sentence it reads as
 * shorthand — the caption is prose, so it gets prose.
 *
 * Units are singular when there is one of them: "1 hour and 1 minute", not
 * "1 hours and 1 minutes".
 */
export function formatListeningLong(ms: number): string {
    const minutes = Math.round(ms / 60e3);

    if (ms <= 0)
        return "no time at all";

    if (minutes < 1)
        return "under a minute";

    const unit = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

    if (minutes < 60)
        return unit(minutes, "minute");

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (remainder === 0)
        return unit(hours, "hour");

    return `${unit(hours, "hour")} and ${unit(remainder, "minute")}`;
}
