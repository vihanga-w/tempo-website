// API endpoints.
//
// NEXT_PUBLIC_* is inlined at build time, so this is fixed when `next build`
// runs — .env.production carries the deployed value and .env.local overrides it
// for local work. The socket URL is derived from it so the two cannot disagree.
//
// The fallback matches .env.production rather than the retired
// api.tempo-music.co, so a build with no env file still reaches a real backend
// instead of failing with ERR_NAME_NOT_RESOLVED.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://tempo-be.vihangaw.xyz";
export const API_URL_SOCK = API_URL.replace(/^http/, "ws");
export const FRIENDS_PLAYBACK_SESSIONS_CACHE_KEY = "tempo-friends-sessions-cache";
export const ME_CACHE_KEY = "tempo-me-profile-cache";
export const ME_FRIENDS_CACHE_KEY = "tempo-me-friends-cache";

// Which VAPID public key this device's push subscription was created with.
//
// A subscription is permanently bound to the application server key it was made
// with, so once the server's key changes the endpoint can never be pushed to
// again — silently, with no client-side error. Recording the key lets the app
// notice the mismatch on load and re-subscribe instead of looking subscribed
// while receiving nothing.
// How long a profile's listening figures may be served from cache.
//
// They change with every track played, so a long cache means a profile that
// simply does not move while you are looking at it. Short enough to feel live,
// long enough that flicking between pages does not refetch on every tap.
export const PROFILE_STATS_CACHE_MS = 60e3;

export const NOTIF_VAPID_KEY = "tempo-notif-vapid";

// Set once the user has answered the notification prompt, so they are only
// asked the once. Cleared whenever NOTIF_VAPID_KEY goes stale.
export const NOTIF_PROCESSED_KEY = "tempo-notif-processed";

// The id this device files its subscription under, kept so re-registering
// overwrites the same server-side record instead of piling up a new one per app
// start. The server stores subscriptions as `<userId>-<deviceId>`.
export const NOTIF_SUB_ID_KEY = "tempo-notif-subid";
/**
 * Which account last signed in on this device, by Spotify ID.
 *
 * Sign-in has to name a Spotify app before the redirect, and an account that
 * enrolled with its own app can only be routed there if we know who is asking.
 * The default flow does not: it enrols against Tempo's app, whose development
 * mode admits almost nobody, so a returning bring-your-own-app user consented
 * against the wrong app, was refused, and landed on the setup page as though
 * they had never enrolled. Remembering the ID lets every later sign-in start
 * at /auth/start, which looks up their app server-side.
 *
 * The canonical ID rather than the display name: names are not unique, and the
 * server refuses to guess between two accounts sharing one.
 */
export const KNOWN_USER_KEY = "tempo.known-user";
