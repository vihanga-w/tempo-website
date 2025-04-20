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