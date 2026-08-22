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