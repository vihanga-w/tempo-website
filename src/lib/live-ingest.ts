import EventEmitter from "events";
import { API_URL, API_URL_SOCK } from "./const";
import { randomBytes } from "crypto";

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
    entropy: number;
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

export class DataStreamer extends EventEmitter {
    // private stream?: Stream;
    private sock?: WebSocket;
    private interval?: NodeJS.Timeout;
    private cache: {[key: string]: UpdateEvent};
    private sockCallbacks: {[key: string]: (data: {[key: string]: any}) => void}
    private storedToken?: string;
    private userFilters?: string[];

    constructor(storedToken?: string, userIdFilter?: string[]) {
        super();
        
        this.cache = {};
        this.sockCallbacks = {};
        this.storedToken = storedToken;
        this.userFilters = userIdFilter;
    }

    isReady() {
        return (this.sock && this.sock.OPEN);
    }

    cleanup() {
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

    async init(prevUserIds?: string[]) {
        this.cleanup();

        const retryInterval = 6e3;
        const maxRetries = 50;
        let attempts = 0;

        const connect = async () => {
            try {
                // Setup connection to server
                let sessions = await this.fetchPublicStreams();

                if (this.userFilters?.some(v => !sessions.includes(v)))
                    this.emit("not-listening", this.userFilters.filter(v => !sessions.includes(v.replace("!", ""))));

                if (this.interval)
                    try { clearInterval(this.interval); } catch { }

                // Remove states if they no longer exist
                // Such as if app is reopened after a while and states are now stale
                for (const userId of prevUserIds ?? []) {
                    if (!sessions.includes(userId))
                        this.emit("remove", userId);
                }

                let sessionReadyCb: (() => void) | undefined;

                this.sock = new WebSocket(API_URL_SOCK + "/stream/sessions" + (this.storedToken ? "/lazy" : ""));

                this.interval = setInterval(async () => {
                    if (sessionReadyCb || !this.sock || !this.sock.OPEN)
                        return;

                    const newSessions = await this.fetchPublicStreams();
                    const currentListeners = await this.getListeners();

                    const expiredListeners = currentListeners.filter(v => !newSessions.includes(v));
                    
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

                    if (currentListeners.sort().join("") !== newSessions.join("") && this.sock && this.sock.OPEN) {
                        console.log("Sending new sessions:", newSessions);
                        this.sock.send(JSON.stringify(newSessions));
                    }
                }, 5e3);

                let userIntervals: {[key: string]: NodeJS.Timeout} = {};

                this.sock.onmessage = (m) => {
                    try {
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

                            const intervalId = (parsed.state?.userId ?? "");

                            if (userIntervals[intervalId])
                                clearInterval(userIntervals[intervalId]);

                            if (action?.startsWith("PLAYING") || action?.startsWith("SKIPPED") || action?.startsWith("LISTENED") || action?.startsWith("PAUSED") || action?.startsWith("REPLAYED")) {
                                const targetAction = action.split(":")[0];
                                const songId = action.split(":")[1];

                                parsed.action.type = targetAction as ParsedStateUpdate["action"]["type"];
                                parsed.action.songId = songId;
                            }

                            const userId = (parsed.state?.userId ?? "");

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

                            this.cache[userId] = payload;

                            if (this._isUserIdInFilter(userId)) {
                                this.emit("update", payload);
                                this.emit("update-" + userId, payload);
                            }
                        }
                    } catch (ex) {
                        console.warn("Failed to parse streaming API response, error:", ex);
                    }
                }

                this.sock.onclose = async () => {
                    this.emit("close");
                    
                    Object.values(userIntervals).forEach(v => {
                        try { clearInterval(v); } catch { }
                    });

                    await new Promise(resolve => setTimeout(resolve, 1e3));

                    // Attempt to reconnect
                    this.init();
                }

                this.sock.onopen = () => {
                    sessionReadyCb = () => {
                        if (this.sock && this.sock.OPEN) {
                            this.emit("open");
                            this.sock.send(JSON.stringify(sessions));
                            sessionReadyCb = undefined;
                        }
                    }
                    
                    if (this.storedToken) {
                        this.sock?.send(JSON.stringify({
                            overrideToken: this.storedToken,
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

    public getPrevState(userId: string) {
        return this.cache[userId];
    }

    private getAuthHeaders() {
        const headers: {[key: string]: string} = {};

        if (this.storedToken)
            headers["x-api-token"] = this.storedToken;
        
        return headers;
    }

    private async fetchPublicStreams() {
        const req = await fetch(API_URL + "/spotify/public/sessions", {
            headers: {
                ...(this.getAuthHeaders())
            },
            credentials: "include",
        });
        const res = await req.json() as PublicSessionResponse;

        return res.sort();
    }
}