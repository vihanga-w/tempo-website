export function getSizedImageUrl(url: string, width: number, height: number) {
    // Rewrite to our cdn
    if (url.startsWith("https://i.scdn.co/image/"))
        url = url.replace("https://i.scdn.co/image/", "https://imgcdn.tempo-music.co/scdn/");

    if (url.startsWith("https://imgcdn.tempo-music.co/scdn/"))
        return url + `?s=${width}x${height}`;

    return url;
}