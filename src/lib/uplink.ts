'use client';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import NodeRSA from 'node-rsa';
import { v4 as uuidv4 } from 'uuid';
import { MessageObject, RecipientPayload } from './encryption';
import { Conversation, ConversationResponse } from './convo';

export type StateChangeEvent = {
    type: "connection";
    data: string;
    timestamp: number;
}

type UplinkFrameType = (
    "init" |
    "error" |
    "keepalive" |
    "register" |
    "meta" |
    "isEmailAvailable" |
    "verify-encryption" |
    "enroll-encryption" |
    "lookup-user" |
    "circle-add" |
    "msg-update" |
    "msg-typing" |
    "msg-typing-cancel" |
    "user-activity-update" |
    "list-cases" |
    "sectnl" // Secured Tunnel
);


type UplinkSecuredSubFrameType = (
    "s-init" |
    "s-handshake" |
    "s-createauth" |
    "s-claimregauth" |
    "s-synctoken" |
    "s-fetchtoken" |
    "s-verify" |
    "s-createconvo" |
    "s-getconvo" |
    "s-sendmsg" |
    "s-loadkeychain" |
    "s-closetunnel"
);

export type UplinkDataFrame = {
    type: UplinkFrameType | UplinkSecuredSubFrameType;
    errorCode?: number;
    payload: string | Object;
    frameId?: string;
    responseFrameId?: string;
}

type SecureTunnelPayload = {
    type: UplinkDataFrame["type"],
    payload: string;
    auth: string;
    iv: string;
}

let frameListeners: {[key: string]: (data: UplinkDataFrame, completeCb: () => void) => void} = {};

class ResponseFrame {
    public type: UplinkDataFrame["type"];
    public errorCode: UplinkDataFrame["errorCode"];
    public payload: UplinkDataFrame["payload"];
    public frameId: UplinkDataFrame["frameId"];
    public responseFrameId: UplinkDataFrame["responseFrameId"];
    private replyCb: (data: UplinkDataFrame) => Promise<ResponseFrame>;

    constructor(responseFrame: UplinkDataFrame, replyCb: (data: UplinkDataFrame) => Promise<ResponseFrame>) {
        this.type = responseFrame.type;
        this.errorCode = responseFrame.errorCode;
        this.payload = responseFrame.payload;
        this.frameId = responseFrame.frameId;
        this.responseFrameId = responseFrame.responseFrameId;
        this.replyCb = replyCb;
    }

    async respond(data: UplinkDataFrame) {
        return await this.replyCb(data);
    }
}

export class SecureUplink extends EventEmitter {
    private uplink: Uplink;
    private sessionKey: string = "";

    constructor(uplink: Uplink) {
        super();

        this.uplink = uplink;

        uplink.startSecureTunnelLegacy()
        .then(k => {
            this.sessionKey = k;
            this._init()
        });
    }

    private async _init() {
        const ready = await this.uplink.verifyTunnelToken(this.sessionKey);

        if (!ready)
            throw new Error("Secure tunnel token validation failed");

        this.emit("ready");
    }

    public async pushSecureFrame(frame: UplinkDataFrame, responseFrameId?: string): Promise<ResponseFrame> {
        if (this.sessionKey == "")
            throw new Error("Attempted to push a secure frame without a session key");

        // Make sure the payload is sent off as a string
        if (typeof frame.payload == "object")
            frame.payload = JSON.stringify(frame.payload);

        const res = await this.uplink.pushSecTunFrame(frame, this.sessionKey, responseFrameId);

        return new ResponseFrame(res, async (data) => {
            return await this.pushSecureFrame(frame, res.frameId);
        });
    }

    public async sendMessage(convo: Conversation | ConversationResponse, data: {
        message: MessageObject;
        recipientKeys: RecipientPayload[];
        signatures: {
            security: string;
            primary: string;
        };
    }) {
        const convoId = convo.id;

        type SendMessagePayload = {
            convoId: string;
            message: MessageObject;
            recipientKeys: RecipientPayload[];
            signatures: {
                security: string;
                primary: string;
            }
        }
        
        const payload: SendMessagePayload = {
            convoId,
            ...data,
        }

        console.log(payload);

        const res = await this.pushSecureFrame({
            type: "s-sendmsg",
            payload: payload,
        });

        console.log(res);

        // TODO: Add handling for each error code expected

        if (res.type == "error")
            throw new Error("Failed to push message, response: " + JSON.stringify(res));

        // Return the success state
        return (res.type == "s-sendmsg" && res.payload == "success");
    }

    public async close() {
        if (this.sessionKey == "")
            return;

        this.uplink.closeSecureTunnel(this.sessionKey);
    }
}

class Connector extends WebSocket {
    sendFrame(
        payload: UplinkDataFrame,
        callback?: (data: UplinkDataFrame, completeCb: () => void) => void,
        respondToFrameId?: string,
    ) {
        payload.frameId = uuidv4();
        if (respondToFrameId) payload.responseFrameId = respondToFrameId;
        if (callback) frameListeners[payload.frameId] = callback;

        this.send(JSON.stringify(payload));
    }

    sendSTunFrame(
        payload: UplinkDataFrame,
        sharedSecret: string,
        callback?: (data: UplinkDataFrame, completeCb: () => void) => void,
        respondToFrameId?: string,
    ) {
        payload.frameId = uuidv4();

        // Make sure the provided key is a valid size
        const secretKey = createHash('sha512').update(sharedSecret).digest('hex').substring(0, 32);

        // Initialisation Vector
        const iv = randomBytes(16);

        // Create a new cipher using provided key and generated iv
        const cipher = createCipheriv("aes-256-gcm", secretKey, new Uint8Array(iv));

        const securePayload: SecureTunnelPayload = {
            type: payload.type,
            payload: Buffer.from(
                // Encrypt the provided payload
                cipher.update(JSON.stringify(payload), 'utf8', 'hex') + cipher.final('hex')
            ).toString('base64'),
            // Auth tag is used to detect tampering of the payload during transmission
            auth: cipher.getAuthTag().toString("hex"),
            // IV is needed to decrypt the payload
            iv: iv.toString("hex"),
        };
    
        // Wrap the secured payload in a normal "sectnl" payload
        const wrapperPayload: UplinkDataFrame = {
            type: "sectnl",
            payload: JSON.stringify(securePayload),
            frameId: payload.frameId,
            responseFrameId: respondToFrameId,
        }
    
        // Overwrite provided callback to automatically decrypt receive
        if (callback) frameListeners[payload.frameId] = (frame, cb) => {
            const secureFrame = (typeof frame.payload == "string" ? JSON.parse(frame.payload): frame.payload) as SecureTunnelPayload;

            const iv = Buffer.from(secureFrame.iv, "hex");

            const buff = Buffer.from(secureFrame.payload , 'base64');
            const decipher = createDecipheriv("aes-256-gcm", secretKey, new Uint8Array(iv));

            decipher.setAuthTag(new Uint8Array(Buffer.from(secureFrame.auth, "hex")));

            const decodedPayload = JSON.parse(
                decipher.update(buff.toString('utf8'), 'hex', 'utf8') +
                decipher.final('utf8')
            ) as UplinkDataFrame;

            // The original callback, now with the decrypted data
            callback(decodedPayload, cb);
        };

        this.send(JSON.stringify(wrapperPayload));
    }

    decodeSocketMessage(payload: string) {
        try {
            const parsed = JSON.parse(payload) as UplinkDataFrame;
    
            if (!parsed.frameId) parsed.frameId = "";
    
            return parsed;
        } catch (ex) {
            console.error("[decodeSocketMessage] Failed to decode socket message, payload:", payload, "error:", ex);
    
            return null;
        }
    }
}

function asyncWait(milliseconds: number) {
    return new Promise<void>((resolve, _) => {
        setTimeout(resolve, milliseconds);
    });
}

function createWaitTrigger() {
    let cb: () => void;
    
    return {
        trigger: () => {
            if (cb) cb();
        },
        wait: () => {
            return new Promise<void>((resolve, _) => {
                cb = resolve;
            });
        }
    }
}

export class Uplink extends EventEmitter {
    public isReady: boolean;
    private connectionMeta: {
        initTime: number;
        connTime: number;
        stopConnectAttempt?: boolean;
    }
    private connState: string;
    private sock: Connector | null;
    private isInitialConnect: boolean;
    public connectionId: string;
    private socketCreateAttemptCount: number;
    public initialUIDirective: boolean;
    private authResyncCb?: () => string;
    private userActivityUpdateHandler: {
        [key: string]: (state: string) => void;
    } = {};
    private msgUpdateHandler: {
        [key: string]: (data: {
            convoId: string;
            msgId: string;
        }) => Promise<void>;
    } = {};
    private typingUpdateHandler: {
        [key: string]: (userId: string, cancel?: boolean) => void;
    } = {};

    constructor() {
        // Inherit all the methods from the EventEmitter class
        super();

        this.initialUIDirective = false;
        this.socketCreateAttemptCount = 0;
        this.connectionId = "";
        this.isInitialConnect = true;
        this.sock = null;
        this.isReady = false;
        this.connState = "Attempting to establish connection to the server";
        this.connectionMeta = {
            initTime: new Date().getTime(),
            connTime: -1,
        }
    }

    init() {
        // Setup the connection to the server
        this._initServerConn();
    }

    fetchConnState(): string {
        return this.connState;
    }

    setMessageUpdateHandler(cb: (data: {
        convoId: string;
        msgId: string;
    }) => Promise<void>, convoId?: string) {
        this.msgUpdateHandler[convoId ?? "all"] = cb;
    }

    setUserActivityUpdateHandler(cb: (state: string) => void, userId: string) {
        // no-op if the user already has a handler
        if (this.userActivityUpdateHandler[userId]) return;

        this.pushFrame({
            type: "user-activity-update",
            payload: userId,
        })
        .then(() => {
            this.userActivityUpdateHandler[userId] = cb;
        });
    }

    hasUserActivityUpdateHandler(userId: string): boolean {
        console.log(this.userActivityUpdateHandler)
        return !!this.userActivityUpdateHandler[userId];
    }

    removeUserActivityUpdateHandler(userId: string) {
        delete this.userActivityUpdateHandler[userId];
        
        this.pushFrame({
            type: "user-activity-update",
            payload: `remove::${userId}`,
        });
    }

    setTypingHandler(cb: (userId: string, cancel?: boolean) => void, convoId: string) {
        this.typingUpdateHandler[convoId] = cb;
    }

    removeTypingHandler(convoId: string) {
        delete this.typingUpdateHandler[convoId];
    }

    sendTypingNotification(convoId: string) {
        this.pushFrame({
            type: "msg-typing",
            payload: convoId,
        });
    }

    cancelTypingNotification(convoId: string) {
        this.pushFrame({
            type: "msg-typing-cancel",
            payload: convoId,
        });
    }

    getSocket() {
        if (!this.sock) throw new Error("cannot return an empty socket, is the server uplink active?");

        return this.sock;
    }

    setAuthResyncCb(cb: () => string) {
        this.authResyncCb = cb;
    }

    setUserAuthToken(token: string) {
        return new Promise<void>(async (resolve, _) => {
                // no-op if token is invalid
            if (token == "") return resolve();

            const key = await this.startSecureTunnelLegacy();

            this.pushSecTunFrameSync({
                type: "s-synctoken",
                payload: token,
            }, key, async (_, cb) => {
                await this.closeSecureTunnel(key);

                cb();
                resolve();
            });
        });
    }

    claimToken(jwtKey: string) {
        return new Promise<string>(async (resolve, reject) => {
            const sharedSecret = await this.startSecureTunnelLegacy();

            this.pushSecTunFrameSync({
                type: "s-fetchtoken",
                payload: jwtKey,
            }, sharedSecret, async (data, cb) => {
                if (data.type == "error")
                    return reject("Invalid s-fetchtoken response: " + JSON.stringify(data));

                const token = data.payload as string;

                await this.closeSecureTunnel(sharedSecret);

                resolve(token);
            });
        });
    }

    closeSecureTunnel(sharedSecret: string) {
        return new Promise<void>((resolve, _) => {
            this.pushSecTunFrameSync({
                type: "s-closetunnel",
                payload: "",
            }, sharedSecret, (frame, cb) => {
                if (frame.payload === "ack") console.log("Closed secure tunnel!");
                else console.warn("Unexpected response to request to close secure tunnel, we will assume the tunnel is now in a closed state");
                
                cb();
                resolve();
            });
        });
    }

    pushFrameSync(frame: UplinkDataFrame, cb?: ((data: UplinkDataFrame, completeCb: () => void) => void), responseFrameId?: string) {
        if (!this.isReady || !this.sock?.OPEN) throw new Error("socket not ready to receive a new frame! isReady:" + this.isReady.toString() + " socket readyState:" + this.sock?.readyState);

        this.sock.sendFrame(frame, cb, responseFrameId);
    }

    pushFrame(frame: UplinkDataFrame, respondToFrameId?: string) {
        return new Promise<UplinkDataFrame>((resolve) => {
            this.pushFrameSync(frame, (data, cb) => {
                cb();
                resolve(data);
            }, respondToFrameId);
        });
    }

    verifyTunnelToken(token: string) {
        return new Promise<boolean>((resolve, reject) => {
            const check = randomBytes(6).toString("hex");

            this.pushSecTunFrameSync({
                type: "s-verify",
                payload: check,
            }, token, (data, cb) => {
                if (data.type == "error") {
                    console.warn("Invalid secure tunnel token: Server returned an error whilst verifying the token. Payload:", data.payload, "ErrorCode:", data.errorCode);

                    return reject(false);
                }

                if (data.type == "s-verify" && data.payload == check)
                    return resolve(true);

                console.warn("Invalid secure tunnel token: The server returned an unexpected (non-error) response");

                reject(false);
            });
        });
    }

    startSecureTunnelLegacy() {
        // This is an asynchronous function, return a promise so we can await it and wait for it to resolve
        return new Promise<string>((resolve, reject) => {
            // Create a secure random RSA keypair
            let initKey: NodeRSA | undefined = new NodeRSA({ b: 512 });

            // The initial secure tunnel create payload
            const secTnlInitFrame: UplinkDataFrame = {
                type: "s-init",
                // Export the public key from the RSA keypair
                payload: initKey.exportKey("pkcs8-public-pem"),
            }

            // Step 4: Complete handshake
            const tnlHandshakePhase2 = (sessionKey: string, frame: UplinkDataFrame, cb: () => void) => {
                if (frame.payload == "1") {
                    console.log("Secure tunnel handshake phase 1 complete");

                    this.pushSecTunFrameSync({
                        type: "s-handshake",
                        payload: "2"
                    }, sessionKey, (_, cb) => {
                        console.log("Secure tunnel handshake phase 2 complete, handshake has been acknowledged!");
                        console.log("Established a secure server <--> client tunnel!");
                        
                        // Dispose the RSA key
                        initKey = undefined;

                        // Tell uplink handler to remove callbacks for this event
                        cb();

                        // Resolve the session key, the caller can now use this
                        resolve(sessionKey);
                    }, frame.frameId);
                } else if (frame.type == "error") {
                    console.error("Failed to complete secure tunnel handshake phase 1, error:", frame.payload, "error code:", frame.errorCode);

                    reject(frame.payload);
                }
                
                cb();
            }

            // Step 2: Receive session key and begin handshake to verify it
            const tnlInitiateCb = async (frame: UplinkDataFrame, cb: () => void) => {
                const sessionKey = Buffer.from(initKey!.decrypt(frame.payload as string, "base64"), "base64").toString();

                console.log("Got secure tunnel shared secret!");
                console.log("Started secure tunnel handshake");

                // Step 3: Send first encryption check payload
                this.pushSecTunFrameSync({
                    type: "s-handshake",
                    payload: "chk"
                }, sessionKey, (data, cb) => {
                    tnlHandshakePhase2(sessionKey, data, cb);
                });

                cb();
            }

            // Step 1: Push the public key
            this.pushFrameSync({
                type: "sectnl",
                payload: JSON.stringify(secTnlInitFrame),
            }, tnlInitiateCb);
        });
    }

    startSecureTunnel() {
        return new Promise<SecureUplink>((resolve) => {
            const handler = new SecureUplink(this);

            handler.on("ready", () => {
                resolve(handler);
            });
        });
    }

    pushSecTunFrameSync(frame: UplinkDataFrame, secret: string, cb?: ((data: UplinkDataFrame, completeCb: () => void) => void), responseFrameId?: string) {
        if (!this.isReady || !this.sock?.OPEN) throw new Error("socket not ready to receive a new secure frame! isReady:" + this.isReady.toString() + " socket readyState:" + this.sock?.readyState);

        this.sock.sendSTunFrame(frame, secret, cb, responseFrameId);
    }

    pushSecTunFrame(frame: UplinkDataFrame, secret: string, respondToFrameId?: string) {
        return new Promise<UplinkDataFrame>((resolve) => {
            this.pushSecTunFrameSync(frame, secret, (data, cb) => {
                cb();
                resolve(data);
            }, respondToFrameId);
        });
    }

    private async _initServerConn() {
        while (!this.connectionMeta.stopConnectAttempt) {
            let onlineConnTest: boolean = false;

            try {
                const t = await fetch("/public/noprecache/icheck?i=" + Math.floor(Math.random() * 999999).toString());
                const r = await t.text();

                // There is an active internet connection
                if (r === "Microsoft NCSI") onlineConnTest = true;
            } catch (ex) {
                console.warn("Internet connectivity test failed, error:", ex);
            }

            if (this.socketCreateAttemptCount >= 12 && onlineConnTest) {
                // We are connected to internet but server isnt available
                this.emit("classify-connection-state-change", "outage");
            } else if (this.socketCreateAttemptCount >= 8 && onlineConnTest) {
                this.emit("classify-connection-state-change", "delayed");
            } else if (this.socketCreateAttemptCount >= 6 && onlineConnTest) {
                this.emit("classify-connection-state-change", "down");
            } else if (this.socketCreateAttemptCount >= 2 && !onlineConnTest) {
                // Server down and internet check failed
                this.socketCreateAttemptCount = 2
                this.emit("classify-connection-state-change", "no-internet");
            } else if (this.socketCreateAttemptCount >= 2) {
                this.emit("classify-connection-state-change", "bug");
            }
            
            this.socketCreateAttemptCount++;

            const isServerOnline = await this._pingServer();
        
            if (!isServerOnline) {
                // There was an issue pinging the server!
                this._updateConnState("Unable to connect to server!");

                console.log("[_initServerConn] Unable to ping server, we will attempt to connect again in 5 seconds...")

                // Attempt to reconnect in 5 seconds
                await asyncWait(5e3);

                continue;
            }

            this._updateConnState("Got successful server ping, initiating socket!");

            const req = await fetch("/api/uplink-base");
            const uplinkRemoteTarget = await req.text();

            // const uplinkRemoteTarget = `ws${location.href.startsWith("https") ? "s" : ""}://${location.host}/api/uplink`;
            // const uplinkRemoteTarget = "wss://9925-vihangathet-mchatalevel-7tex8nvq2ta.ws-eu110.gitpod.io/uplink";

            console.log("Target server:", uplinkRemoteTarget);

            const wait = createWaitTrigger();

            // We have confirmed that the server is online, connect to it!
            const newSock = new Connector(uplinkRemoteTarget);

            newSock.onopen = () => {
                console.log("Opened connection to server, initiating handshake!");
                this._updateConnState("Connected to server, awaiting handshake completion!");

                newSock.sendFrame({
                    type: "init",
                    payload: "",
                }, async (data, cb) => {
                    if (data.type == "error") {
                        this._updateConnState(`Handshake failed, error: "${data.payload}"`);
                    } else {
                        // Connection successful!
                        if (this.isInitialConnect) this.emit("initial-connect");

                        // Set the connection id
                        this.connectionId = (data.payload as string).split(":")[1];

                        this.isInitialConnect = false;
                        this.sock = newSock;
                        this.connectionMeta.stopConnectAttempt = true;
                        this.isReady = true;

                        if (this.authResyncCb && !this.isInitialConnect) {
                            // Resync auth token if we have reconnected
                            await this.setUserAuthToken(this.authResyncCb());
                        }

                        this.emit("ready");
                        this.emit("classify-connection-state-change", "active");
                        this._updateConnState("Connected to server!");

                        wait.trigger();
                    }

                    cb();
                });
            }

            newSock.onmessage = async (e) => {
                const data = newSock.decodeSocketMessage(e.data);

                if (!data) return console.log("Received an empty frame, raw payload:", e.data);

                if (data.responseFrameId && frameListeners[data.responseFrameId]) {
                    const targetFrameId = data.responseFrameId;

                    // Complete the cb and remove listener when finished
                    frameListeners[targetFrameId](data, () => {
                        delete frameListeners[targetFrameId];
                    });

                    // We dont need to further process this frame, it is already being handled
                    return;
                }

                switch (data.type) {
                    case "keepalive": {
                        console.log("Got a keepalive!");

                        return newSock.sendFrame({
                            type: "keepalive",
                            payload: "ack",
                        }, undefined, data.frameId);
                    }
                    case "error": {
                        return console.log("Server sent an error type frame! Payload:", data.payload, "Error Code:", data.errorCode, "Involved Frames:", data.frameId + ":" + (data.responseFrameId ?? data.frameId));                        
                    }
                    // This case will fall through to msg-typing snce nothing is returned
                    case "msg-typing-cancel":
                    case "msg-typing": {
                        const res = JSON.parse(data.payload as string) as {
                            convoId: string;
                            userId: string;
                        };
                        
                        // If no specific handler exists, use the "all" handler
                        if (this.typingUpdateHandler[res.convoId])
                            this.typingUpdateHandler[res.convoId](res.userId, data.type == "msg-typing-cancel");

                        return;
                    }
                    case "user-activity-update": {
                        const res = JSON.parse(data.payload as string) as {
                            userId: string;
                            state: string;
                        };
                        
                        // no-op if a handler doesnt exist
                        if (!this.userActivityUpdateHandler[res.userId])
                            return;

                        this.userActivityUpdateHandler[res.userId](res.state);

                        return;
                    }
                    case "msg-update": {
                        const res = JSON.parse(data.payload as string) as {
                            convoId: string;
                            msgId: string;
                        };

                        // If no specific handler exists, use the "all" handler
                        this.msgUpdateHandler[Object.keys(this.msgUpdateHandler).includes(res.convoId) ? res.convoId : "all"](res);

                        return;
                    }
                    default:
                        console.log(`Got an unexpected frame of type "${data.type}" from server! Frame:`, data);
                }
            }

            newSock.onclose = () => {
                console.log("Connection to server has been terminated!");

                this.connectionId = "";
                this.connectionMeta.stopConnectAttempt = false;
                this.sock = null;
                this.isReady = false;
                this.emit("close");
                this.emit("classify-connection-state-change", "offline");

                this._updateConnState("Lost connection to server! Attempting to reconnect...");

                setTimeout(() => {
                    this._initServerConn();
                }, 1e3);
            }

            await wait.wait();

            // Connection success!
            // Reset connections error counter
            this.socketCreateAttemptCount = 0;
        }
    }

    private _updateConnState(newState: string) {
        this.connState = newState;

        const payload: StateChangeEvent = {
            type: "connection",
            data: newState,
            timestamp: new Date().getTime(),
        }

        this.emit("state-change", payload);
    }

    private async _pingServer() {
        try {
            const req = await fetch("/api/ping");
            const res = await req.text();

            // Is the server reachable?
            if (req.status.toString().startsWith("2") && res == "pong") return true;

            console.warn("[_pingServer] Response from backend sever ping was invalid! Response Code:", req.status, "Response Body:", (res.length < 100 ? res : (res.slice(0, 93 - (res.length - 100).toString().length) + "... (+" + (res.length - 100).toString() + ")")));

            return false;
        } catch (ex) {
            console.error("[_pingServer] Ping request failed, error:", ex);
        }
    }
}
