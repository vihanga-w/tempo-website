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

    // Padding the minutes lines a column up, but "1h 08m" is a stopwatch reading
    // rather than an amount of listening to anyone who has not spent their life
    // looking at zero padded numbers.
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
