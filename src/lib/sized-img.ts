import { API_URL } from "./const";

/**
 * Rewrites a Spotify image URL to our own image endpoint at the requested size.
 *
 * The API converts and stores each variant in R2 on first request and redirects
 * there, so repeat loads are served by R2 rather than by us. Sizes must be one
 * the API allows, otherwise it responds 400 with the supported list.
 */
export function getSizedImageUrl(url: string | undefined | null, width: number, height: number) {
    /*
     * A payload can leave a cover out where the type says it cannot, and
     * reading startsWith off nothing throws in the middle of a render - which
     * takes the whole card that was drawing it off the screen, not just its
     * artwork. Nothing in, nothing out: an image with no source draws nothing,
     * which is what a missing cover should look like.
     */
    if (!url || !url.startsWith("https://i.scdn.co/image/"))
        return url ?? "";

    const imageId = url.slice("https://i.scdn.co/image/".length);

    return `${API_URL}/img/${imageId}?s=${width}x${height}`;
}
