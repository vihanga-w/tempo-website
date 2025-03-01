import EventEmitter from "events";

type PublicSessionResponse = string[];
interface Stream {
    socket: WebSocket;
    lastState?: UpdateEvent;
    closeExpected: boolean;
    close: () => void;
}
interface PlaybackState {
    songId: string;
    albumId: string;
    progressNormal: number;
    isPlaying: boolean;
    timeRemaining: number;
    imageUrl: string;
    pfpUrl: string;
    username: string;
    explicit: boolean;
    name: string;
    artists: {
        name: string;
        url: string;
    }[];
    updatedAt: number;
    lastEventSentAt: number;
};
interface StateUpdateEvent {
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
    private streams: { [key: string]: Stream };

    constructor() {
        super();

        this.streams = {};
    }

    async init() {
        // Reset all states
        this.streams = {};

        try {
            // Setup connection to server
            let sessions = await this.fetchPublicStreams();

            setInterval(async () => {
                const newSessions = await this.fetchPublicStreams();

                if (sessions.sort().join("") !== newSessions.sort().join("")) {
                    for (const k of Object.keys(this.streams)) {
                        const stream = this.streams[k];

                        if (newSessions.includes(k))
                            stream.closeExpected = true;

                        stream.close();
                    }

                    this.init();
                }
            }, 10e3);

            sessions.forEach((userId) => {
                const sock = new WebSocket("wss://tempo.filmclick.eu.org/stream/" + userId);

                const removeSession = () => {
                    const s = this.streams[userId];

                    if (s) {
                        // Try close socket if not already
                        try {
                            if (!sock.CLOSED && !sock.CLOSING)
                                sock.close();
                        } catch { }

                        if (!this.streams[userId].closeExpected)
                            this.emit("remove", userId);

                        this.streams[userId].closeExpected = false;

                        delete this.streams[userId];
                    }
                }

                let interval: NodeJS.Timeout;

                sock.onmessage = (m) => {
                    try {
                        const data = JSON.parse(m.data) as StateUpdateEvent;

                        // This is a keepalive
                        if (data.code == -1) {
                            sock.send(JSON.stringify({
                                code: -1
                            }));

                            return;
                        }

                        if (data.code == 200) {
                            const state = data.data;
                            const action = state?.action;

                            if (interval)
                                clearInterval(interval);

                            let parsed: ParsedStateUpdate = {
                                state: state?.state,
                                action: {
                                    type: action as ParsedStateUpdate["action"]["type"] ?? "LOAD",
                                    songId: "",
                                }
                            };

                            if (action?.startsWith("PLAYING") || action?.startsWith("SKIPPED") || action?.startsWith("LISTENED") || action?.startsWith("PAUSED") || action?.startsWith("REPLAYED")) {
                                const targetAction = action.split(":")[0];
                                const songId = action.split(":")[1];

                                parsed.action.type = targetAction as ParsedStateUpdate["action"]["type"];
                                parsed.action.songId = songId;
                            }

                            if (parsed.state?.isPlaying) {
                                const now = Date.now();
                                const timeElapsed = (now - parsed.state.updatedAt) / 1000; // in seconds
                                const duration = (parsed.state.timeRemaining / (1 - parsed.state.progressNormal));
                                const currentTime = Math.min(duration * parsed.state.progressNormal, duration);
                                parsed.interpolatedProgress = (currentTime + (timeElapsed * 1e3)) / duration;

                                interval = setInterval(() => {
                                    requestAnimationFrame(() => {
                                        const now = Date.now();
                                        const timeElapsed = (now - parsed.state!.updatedAt) / 1000; // in seconds
                                        const interpolatedValue = Math.min((currentTime + (timeElapsed * 1e3)) / duration, 1);
                                        parsed.interpolatedProgress = interpolatedValue;

                                        const payload: UpdateEvent = {
                                            userId,
                                            data: parsed,
                                        };

                                        this.emit("update", payload);
                                    });
                                }, 500);

                                sock.onclose = () => {
                                    if (interval)
                                        clearInterval(interval);
                                    
                                    console.warn("Socket closed for stream:", userId);
                                    removeSession();
                                };
                            }

                            const payload: UpdateEvent = {
                                userId,
                                data: parsed,
                            };

                            this.streams[userId].lastState = payload;

                            this.emit("update", payload);
                        }
                    } catch (ex) {
                        console.warn("Failed to parse streaming API response, error:", ex);
                    }
                }

                this.streams[userId] = {
                    socket: sock,
                    close: removeSession,
                    closeExpected: false,
                }
            });
        } catch (ex) {
            console.error("Failed to initialise DataStreamer, error:", ex);
        }
    }

    private async fetchPublicStreams() {
        const req = await fetch("https://tempo.filmclick.eu.org/spotify/public/sessions");
        const res = await req.json() as PublicSessionResponse;

        return res;
    }

    public getLastState(userId: string) {
        if (!this.streams[userId])
            return undefined;

        return this.streams[userId].lastState;
    }
}