import { API_URL } from "./const";

/**
 * Rewrites a Spotify image URL to our own image endpoint at the requested size.
 *
 * The API converts and stores each variant in R2 on first request and redirects
 * there, so repeat loads are served by R2 rather than by us. Sizes must be one
 * the API allows, otherwise it responds 400 with the supported list.
 */
export function getSizedImageUrl(url: string, width: number, height: number) {
    if (!url.startsWith("https://i.scdn.co/image/"))
        return url;

    const imageId = url.slice("https://i.scdn.co/image/".length);

    return `${API_URL}/img/${imageId}?s=${width}x${height}`;
}
