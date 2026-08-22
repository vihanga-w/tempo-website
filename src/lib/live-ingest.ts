import EventEmitter from "events";
import { API_URL, API_URL_SOCK, FRIENDS_PLAYBACK_SESSIONS_CACHE_KEY } from "./const";
import { randomBytes } from "crypto";
import { getCachedObject, setCachedObject } from "./client-cache";

type PublicSessionResponse = string[];
// interface Stream {
//     socket: WebSocket;
//     closeExpected: boolean;
//     close: () => void;
// }
interface SongStatistic {
    totalListenCount: number;
    completeListenCount: number;
    averageSessionDuration: number;
    totalSessionDuration: number;
    skipCount: number;
    replayCount: number;
}

interface PlaybackState {
    userId: string;
    songId: string;
    albumId: string;
    progressNormal: number;
    isPlaying: boolean;
    timeRemaining: number;
    playSessionStart: number;
    duration: number;
    imageUrl: string;
    pfpUrl: string;
    username: string;
    explicit: boolean;
    replayCount: number;
    name: string;
    /** Random value regenerated per song, so server and client agree on which
     *  display variant (e.g. which fact) to show for this playback. */
    displaySeed: number;
    artists: {
        name: string;
        url: string;
    }[];
    updatedAt: number;
    lastEventSentAt: number;
    todayStats: SongStatistic;
    mediaType: "track" | "episode" | "ad" | "unknown";
};
interface StateUpdateEvent {
    id?: string;
    code: number;
    data?: {
        state?: PlaybackState;
        action: string;
    };
}
interface ParsedStateUpdate {
    state?: PlaybackState;
    action: {
        type: "LOAD" | "STOPPED" | "PLAYING" | "PAUSED" | "SKIPPED" | "LISTENED" | "REPLAYED";
        songId: string;
    };
    interpolatedProgress?: number;
}
export interface UpdateEvent {
    userId: string;
    data: ParsedStateUpdate;
}

/**
 * Identifies this client's socket to the server, so a reconnect replaces its own
 * previous socket rather than accumulating dead ones.
 *
 * Kept in sessionStorage so a reload reuses the same id — the replaced socket
 * may not have closed yet — while a second tab or device gets its own and keeps
 * its connection.
 */
function getSocketClientId(): string {
    const KEY = "tempo.socket-client-id";

    try {
        const existing = window.sessionStorage.getItem(KEY);

        if (existing)
            return existing;

        const generated = randomBytes(12).toString("hex");

        window.sessionStorage.setItem(KEY, generated);

        return generated;
    } catch {
        // Private mode or storage disabled — a per-instance id still de-dupes
        // reconnects within this page
        return randomBytes(12).toString("hex");
    }
}

/** Close code the server uses when a newer socket from the same client arrives. */
const SOCKET_REPLACED_CODE = 4000;

/** Server code telling us a friendship changed and should be refetched. */
const FRIENDSHIP_CHANGED_CODE = -30;

export class DataStreamer extends EventEmitter {
    // private stream?: Stream;
    private sock?: WebSocket;
    private interval?: NodeJS.Timeout;
    private cache: {[key: string]: UpdateEvent};
    private sockCallbacks: {[key: string]: (data: {[key: string]: any}) => void}
    private storedToken?: string;
    private userFilters?: string[];
    private callbacks: { [key: string]: (data: any) => void } = {};
    private targets: string[];
    private playbackSessionsCache: {
        t: number;
        d: PublicSessionResponse
    };
    public isOpen: boolean;
    /** Set by cleanup() so a torn-down streamer does not resurrect itself. */
    private closed = false;

    constructor(storedToken?: string, userIdFilter?: string[]) {
        super();
        
        this.cache = {};
        this.sockCallbacks = {};
        this.storedToken = storedToken;
        this.userFilters = userIdFilter;
        this.targets = [];
        this.playbackSessionsCache = {
            t: -1,
            d: [],
        };
        this.isOpen = false;
    }

    detachedListeningStateQuery(userIdFilter: string[]) {
        return userIdFilter.some(v => !this.targets.includes(v));
    }

    isReady() {
        return (this.sock && this.sock.OPEN);
    }

    cleanup() {
        this.closed = true;

        if (this.interval)
            try { clearInterval(this.interval); } catch { }

        if (this.sock && !this.sock.CLOSED)
            try { this.sock.close(); } catch { }

        for (const k of Object.keys(this.cache)) {
            const ev = this.cache[k];

            this.emit("remove", ev.userId);
        }

        this.cache = {};
        this.sockCallbacks = {};
    }

    private _isUserIdInFilter(userId: string) {
        if (!this.userFilters)
            return true;

        if (this.userFilters.includes("!" + userId))
            return false;

        if (this.userFilters.includes("*"))
            return true;
        
        if (this.userFilters.includes(userId))
            return true;

        return false;
    }

    getListeners() {
        return new Promise<string[]>(resolve => {
            if (!this.sock || !this.sock.OPEN)
                return resolve([]);
    
            const id = randomBytes(6).toString("hex");
    
            this.sockCallbacks[id] = (data) => {
                const payload = data as {
                    id: string;
                    userIds: string[];
                }

                delete this.sockCallbacks[id];

                resolve(payload.userIds);
            }
            
            this.sock.send(JSON.stringify([
                "QUERY",
                id,
            ]));
        });
    }

    queryRemoteLastStates(): Promise<(PlaybackState | undefined)[]> {
        return new Promise<(PlaybackState | undefined)[]>((resolve) => {
            if (!this.sock || !this.sock.OPEN)
                return [];
    
            const cbId = randomBytes(8).toString("hex");

            this.callbacks[cbId] = (data: (PlaybackState | undefined)[]) => {
                resolve(data);
            }
    
            this.sock.send(JSON.stringify([
                "QUERY-LAST-STATES",
                cbId,
                ...this.targets,
            ]));
        });
    }

    private processingSessions = false;

    private async processSessions(sessions: string[]) {
        // Called from the 5s poll and from the server's state-change
        // advertisement. Both await getListeners(), so overlapping runs each
        // acted on a stale listener list — sending duplicate RMs and then
        // re-binding a user that had just been removed, which showed as the
        // entry flickering out and back.
        if (this.processingSessions)
            return;

        this.processingSessions = true;

        try {
            await this._processSessions(sessions);
        } finally {
            this.processingSessions = false;
        }
    }

    private async _processSessions(sessions: string[]) {
        const currentListeners = await this.getListeners();

        // Unsubscribe from anyone who stopped. The server advertises a state
        // change to sockets that are not watching a user when they start again
        // (see advertisePlaybackStateChange), so dropping them here is safe and
        // keeps the socket bound only to people actually playing.
        const expiredListeners = currentListeners.filter(v => !sessions.includes(v));

        for (const id of expiredListeners) {
            if (!this.sock || !this.sock.OPEN)
                return;

            this.sock.send(JSON.stringify([
                "RM",
                id,
                "nocb",
            ]));

            if (this._isUserIdInFilter(id))
                this.emit("remove", id);
        }

        // Both sides sorted — comparing a sorted list against an unsorted one
        // reported a difference whenever the server returned a different order
        const changed = sessions.slice().sort().join("|") !== currentListeners.slice().sort().join("|");

        if (changed && this.sock && this.sock.OPEN) {
            console.log("Sending new sessions:", sessions);
            this.sock.send(JSON.stringify(sessions));
        }

        this.targets = sessions;
    }

    async init(prevUserIds?: string[]) {
        // A fresh init means this streamer is wanted again
        this.closed = false;

        this.emit("construct");

        this.cleanup();

        const retryInterval = 6e3;
        const maxRetries = 50;
        let attempts = 0;
        let seshReqInProgress = false;

        const connect = async () => {
            try {
                // Setup connection to server

                const friendsSessionCacheData = getCachedObject<PublicSessionResponse>(FRIENDS_PLAYBACK_SESSIONS_CACHE_KEY, 3600e3 * 4);

                this.targets = (friendsSessionCacheData ?? await this.fetchFriendsStreams());

                if (this.userFilters?.some(v => !this.targets.includes(v)))
                    this.emit("not-listening", this.userFilters.filter(v => !this.targets.includes(v.replace("!", ""))));

                if (this.interval)
                    try { clearInterval(this.interval); } catch { }

                // Remove states if they no longer exist
                // Such as if app is reopened after a while and states are now stale
                for (const userId of prevUserIds ?? []) {
                    if (!this.targets.includes(userId))
                        this.emit("remove", userId);
                }

                let sessionReadyCb: (() => void) | undefined;

                const clientId = getSocketClientId();

                this.sock = new WebSocket(
                    API_URL_SOCK + "/stream/sessions" + (this.storedToken ? "/lazy" : "") + `?c=${clientId}`
                );

                this.interval = setInterval(async () => {
                    if (sessionReadyCb || !this.sock || !this.sock.OPEN || seshReqInProgress)
                        return;

                    try {
                        seshReqInProgress = true;

                        const newSessions = await this.fetchFriendsStreams();

                        seshReqInProgress = false;
                        
                        this.processSessions(newSessions);
                    } catch {
                        seshReqInProgress = false;
                    }
                }, 5e3);

                let userIntervals: {[key: string]: NodeJS.Timeout} = {};
                let pingCompleteCb: ((id: string) => void) | undefined;

                this.sock.onmessage = (m) => {
                    try {
                        if (m.data.startsWith("PONG-")) {
                            if (pingCompleteCb)
                                pingCompleteCb(m.data.split("PONG-")[1]);

                            return;
                        }

                        if (sessionReadyCb) {
                            const data = JSON.parse(m.data) as {
                                error: boolean;
                                message: string;
                                flag?: string;
                            }

                            if (data.flag == "TOK_ACCEPT")
                                sessionReadyCb();
                        }

                        const data = JSON.parse(m.data) as StateUpdateEvent;

                        // QUERY-LAST-STATE response
                        if (data.code === -22 && data.id?.startsWith("QLS-")) {
                            const cbId = data.id.split("QLS-")[1];

                            if (this.callbacks[cbId])
                                return this.callbacks[cbId](data.data);
                        }

                        // State change advertisement
                        if (data.code === -21 && data.id === "StateChangeAdvertisement") {
                            this.processSessions(data.data as unknown as string[]);
                        }

                        // A friend request arrived, or one of ours was accepted.
                        // There is no polling path for friendships, so this is
                        // the only way the UI learns without a manual refresh.
                        if (data.code === FRIENDSHIP_CHANGED_CODE && data.id === "FriendshipChanged") {
                            this.emit("friendship-changed", (data as unknown as { data?: unknown }).data);

                            return;
                        }

                        if (data.id && this.sockCallbacks[data.id]) {
                            try { this.sockCallbacks[data.id](data); } catch (ex) {
                                console.warn("Failed to process socket callback, error:", ex);
                            }

                            return;
                        }

                        // This is a keepalive
                        if (this.sock && data.code == -1) {
                            this.sock.send(JSON.stringify({
                                code: -1
                            }));

                            return;
                        }

                        if (data.code == 200) {
                            const state = data.data;
                            const action = state?.action;

                            let parsed: ParsedStateUpdate = {
                                state: state?.state,
                                action: {
                                    type: action as ParsedStateUpdate["action"]["type"] ?? "LOAD",
                                    songId: "",
                                }
                            };

                            if (parsed.state && parsed.state.imageUrl.includes("https://i.scdn.co/image/")) {
                                parsed.state.imageUrl = parsed.state.imageUrl.replace("https://i.scdn.co/image/", API_URL + "/img/");
                            }

                            if (parsed.state && parsed.state.pfpUrl.includes("https://i.scdn.co/image/")) {
                                parsed.state.pfpUrl = parsed.state.pfpUrl.replace("https://i.scdn.co/image/", API_URL + "/img/");
                            }

                            // Resolved from the envelope for the same reason as
                            // below: on a stop there is no state to read it from,
                            // so this cleared userIntervals[""] and left the
                            // stopped user's progress timer running — which kept
                            // re-emitting their last playing state and brought
                            // them straight back on screen
                            const intervalId = (parsed.state?.userId ?? (data as { userId?: string }).userId ?? "");

                            if (userIntervals[intervalId]) {
                                clearInterval(userIntervals[intervalId]);
                                delete userIntervals[intervalId];
                            }

                            if (action?.startsWith("PLAYING") || action?.startsWith("SKIPPED") || action?.startsWith("LISTENED") || action?.startsWith("PAUSED") || action?.startsWith("REPLAYED")) {
                                const targetAction = action.split(":")[0];
                                const songId = action.split(":")[1];

                                parsed.action.type = targetAction as ParsedStateUpdate["action"]["type"];
                                parsed.action.songId = songId;
                            }

                            // Falls back to the envelope: a STOPPED update carries
                            // no state, so parsed.state?.userId is undefined and
                            // the event would be filed under "" and dropped —
                            // meaning a friend stopping was never processed until
                            // the next session poll noticed them missing
                            const userId = (parsed.state?.userId ?? (data as { userId?: string }).userId ?? "");

                            if (parsed.state?.isPlaying) {
                                const now = Date.now();
                                const timeElapsed = (now - parsed.state.updatedAt) / 1000; // in seconds
                                const duration = parsed.state.duration;
                                const currentTime = Math.min(duration * parsed.state.progressNormal, duration);
                                parsed.interpolatedProgress = (currentTime + (timeElapsed * 1e3)) / duration;

                                if (intervalId !== "") {
                                    userIntervals[intervalId] = setInterval(() => {
                                        requestAnimationFrame(() => {
                                            const now = Date.now();
                                            const timeElapsed = (now - parsed.state!.updatedAt) / 1000; // in seconds
                                            const interpolatedValue = Math.min((currentTime + (timeElapsed * 1e3)) / duration, 1);
                                            parsed.interpolatedProgress = interpolatedValue;

                                            const payload: UpdateEvent = {
                                                userId,
                                                data: parsed,
                                            };

                                            if (parsed.state)
                                                this.cache[userId] = payload;

                                            if (this._isUserIdInFilter(userId)) {
                                                this.emit("update", payload);
                                                this.emit("update-" + userId , payload);
                                            }
                                        });
                                    }, 500);
                                }
                            }

                            const payload: UpdateEvent = {
                                userId,
                                data: parsed,
                            };

                            // Someone starting or stopping changes who is in the
                            // session list, and the socket knows before any poll
                            // would — so drop the caches rather than serving a
                            // stale membership list for up to 15 seconds
                            const wasPlaying = !!this.cache[userId]?.data?.state;
                            const nowPlaying = !!parsed.state;

                            if (wasPlaying !== nowPlaying)
                                this.invalidateSessionsCache();

                            // Storing a stateless envelope on stop left
                            // getPrevState returning a truthy object with no
                            // state, so callers testing presence saw someone as
                            // listening while the card beneath rendered nothing
                            if (nowPlaying)
                                this.cache[userId] = payload;
                            else
                                delete this.cache[userId];

                            if (this._isUserIdInFilter(userId)) {
                                this.emit("update", payload);
                                this.emit("update-" + userId, payload);

                                // A stop is a removal as far as listeners are
                                // concerned; emitting it here means the UI does
                                // not wait for processSessions to notice
                                if (!nowPlaying && wasPlaying)
                                    this.emit("remove", userId);
                            }
                        }
                    } catch (ex) {
                        console.warn("Failed to parse streaming API response, error:", ex);
                    }
                }

                this.sock.onclose = async (event) => {
                    this.emit("close");

                    this.isOpen = false;

                    Object.values(userIntervals).forEach(v => {
                        try { clearInterval(v); } catch { }
                    });

                    // 4000 means the server replaced this socket with a newer one
                    // from the same client. Reconnecting would close the
                    // replacement, which would then reconnect and close this one
                    // — an endless ping-pong. In development two DataStreamer
                    // instances can share a client id (StrictMode double-mount,
                    // or a hot reload leaving the previous instance alive), which
                    // is exactly how that loop starts.
                    if (event?.code === SOCKET_REPLACED_CODE) {
                        console.log("Session socket was replaced by a newer connection, not reconnecting");

                        return;
                    }

                    if (this.closed) {
                        console.log("Session socket closed after cleanup, not reconnecting");

                        return;
                    }

                    await new Promise(resolve => setTimeout(resolve, 1e3));

                    // Attempt to reconnect
                    this.init();
                }

                this.sock.onopen = async() => {
                    sessionReadyCb = () => {
                        if (this.sock && this.sock.OPEN) {
                            this.emit("open");
                            this.sock.send(JSON.stringify(this.targets));
                            sessionReadyCb = undefined;
                            this.isOpen = true;
                        }
                    }

                    this.emit("handshake");

                    // Wait until server has successfully responded to a ping
                    await new Promise<void>(async (resolve, reject) => {
                        if (!this.sock || (this.sock && !this.sock.OPEN))
                            reject("socket is in an invalid state");
                        
                        let pingBackSuccess = false;
                        
                        while (!pingBackSuccess) {
                            const pingId = randomBytes(6).toString("hex");

                            pingCompleteCb = (id: string) => {
                                if (id === pingId) {
                                    pingBackSuccess = true;

                                    resolve();
                                }
                            };

                            this.sock?.send("PING-" + pingId);

                            console.log("Sent readiness ping");

                            await new Promise(r => {
                                setTimeout(r, 200);
                            });
                        }
                    });

                    console.log("Socket is reaady!");
                    
                    if (this.storedToken) {
                        this.sock?.send(JSON.stringify({
                            overrideToken: this.storedToken,
                            clientId,
                        }));
                    } else {
                        sessionReadyCb();
                    }
                }
            } catch (ex) {
                console.error("Failed to initialise DataStreamer, error:", (ex as unknown as Error).toString());
                if (attempts < maxRetries) {
                    attempts++;
                    console.log(`Retrying connection (${attempts}/${maxRetries})...`);
                    setTimeout(connect, retryInterval);
                } else {
                    window.location.reload()
                }
            }
        };

        connect();
    }

    public getPrevState(userId: string): UpdateEvent | undefined {
        return this.cache[userId];
    }

    private getAuthHeaders() {
        const headers: {[key: string]: string} = {};

        if (this.storedToken)
            headers["x-api-token"] = this.storedToken;
        
        return headers;
    }

    /**
     * Drops both layers of session caching.
     *
     * Called whenever a socket update shows someone starting or stopping, so
     * membership is not left waiting on the next uncached poll. Without this the
     * 5s poll interval is throttled by a 15s in-memory cache, and the stored
     * list survives four hours, so a friend appearing or disappearing could take
     * far longer to show than the socket already knew about.
     */
    public invalidateSessionsCache() {
        this.playbackSessionsCache.t = -1;
        this.playbackSessionsCache.d = [];

        try {
            setCachedObject(FRIENDS_PLAYBACK_SESSIONS_CACHE_KEY, undefined);
        } catch { }
    }

    public async fetchFriendsStreams(useCache?: boolean) {
        if (useCache) {
            const cachedData = getCachedObject<PublicSessionResponse>(FRIENDS_PLAYBACK_SESSIONS_CACHE_KEY, 3600e3 * 4);

            if (cachedData)
                return cachedData;
        }

        if (this.playbackSessionsCache.t !== -1 && Date.now() - this.playbackSessionsCache.t <= 15e3)
            return this.playbackSessionsCache.d;

        const req = await fetch(API_URL + "/spotify/friends/sessions", {
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });
        const res = await req.json() as PublicSessionResponse;

        const d = res.sort();

        this.playbackSessionsCache.d = d;
        this.playbackSessionsCache.t = Date.now();

        setCachedObject(FRIENDS_PLAYBACK_SESSIONS_CACHE_KEY, d);

        return d;
    }
}