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
    if (!url)
        return "";

    if (!url.startsWith("https://i.scdn.co/image/"))
        return (isAppleArtwork(url) ? appleArtworkAt(url, width, height) : url);

    const imageId = url.slice("https://i.scdn.co/image/".length);

    return `${API_URL}/img/${imageId}?s=${width}x${height}`;
}

/**
 * Apple Music's artwork host. Its covers are not proxied: Apple sizes them
 * itself, from the dimensions in the file name.
 */
function isAppleArtwork(url: string) {
    try {
        return /(^|\.)mzstatic\.com$/.test(new URL(url).hostname);
    } catch {
        return false;
    }
}

/**
 * An Apple Music cover at `width` by `height`.
 *
 * The API hands artwork out as a template — "{w}x{h}" where the size goes,
 * and sometimes "{f}" for the format — and a filled-in URL has the size in the
 * same place, followed by a crop code and sometimes a quality
 * ("…/600x600bb.jpg", "…/1200x630bf-60.jpg"). Either is sized by replacing it.
 */
function appleArtworkAt(url: string, width: number, height: number) {
    const w = String(Math.max(1, Math.round(width)));
    const h = String(Math.max(1, Math.round(height)));

    if (url.includes("{w}") || url.includes("{h}"))
        return url.replace("{w}", w).replace("{h}", h).replace("{f}", "jpg");

    return url.replace(/\/\d+x\d+([a-z]{2})?(-\d+)?(\.[a-z]+)$/i, `/${w}x${h}$1$2$3`);
}
