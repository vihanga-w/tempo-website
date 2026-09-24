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

    if (isAppleArtwork(url))
        return appleArtworkAt(url, width, height);

    if (!url.startsWith("https://i.scdn.co/image/"))
        return url;

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
 * The API hands artwork out as a template with "{w}x{h}" where the size goes,
 * and a filled-in URL has the size in the same place ("…/600x600bb.jpg"), so
 * either is sized by replacing it.
 */
function appleArtworkAt(url: string, width: number, height: number) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));

    if (url.includes("{w}") || url.includes("{h}"))
        return url.replace("{w}", String(w)).replace("{h}", String(h));

    return url.replace(/\/\d+x\d+(bb|cc|sr)?(\.[a-z]+)$/i, `/${w}x${h}$1$2`);
}
