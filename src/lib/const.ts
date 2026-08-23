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
export const NOTIF_VAPID_KEY = "tempo-notif-vapid";

// Set once the user has answered the notification prompt, so they are only
// asked the once. Cleared whenever NOTIF_VAPID_KEY goes stale.
export const NOTIF_PROCESSED_KEY = "tempo-notif-processed";

// The id this device files its subscription under, kept so re-registering
// overwrites the same server-side record instead of piling up a new one per app
// start. The server stores subscriptions as `<userId>-<deviceId>`.
export const NOTIF_SUB_ID_KEY = "tempo-notif-subid";