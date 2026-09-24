import { Capacitor, registerPlugin } from "@capacitor/core";

import { API_URL } from "./const";
import { fetchThroughRateLimit } from "./rate-limit";

/**
 * Linking Apple Music.
 *
 * Tempo's server cannot sign anybody in to Apple Music. MusicKit can, on the
 * device: natively in the iOS app (ios/App/App/AppleMusicPlugin.swift), and
 * through MusicKit on the Web in a browser. Either way what comes back is a
 * music user token, which is handed to the server, and the server reads the
 * listener's recently played tracks with it.
 *
 * The token expires without warning and cannot be renewed by the server, so
 * the app hands over the current one each time it opens. That never asks the
 * listener anything: only linking does.
 */

/**
 * "failed" is MusicKit on the Web's sign-in not finishing — a pop-up blocked or
 * closed, or Apple's page failing — which it does not tell apart from a no.
 */
type AuthorizationStatus = "authorized" | "denied" | "restricted" | "notDetermined" | "unknown" | "failed";

interface UserTokenResult {
    status: AuthorizationStatus;
    userToken?: string;
    /** Only known on iOS. Reading recently played tracks needs a subscription. */
    canPlayCatalogContent?: boolean;
}

interface AppleMusicPlugin {
    authorizationStatus(): Promise<{ status: AuthorizationStatus }>;
    authorize(options: { developerToken: string }): Promise<UserTokenResult>;
    userToken(options: { developerToken: string; fresh?: boolean }): Promise<UserTokenResult>;
}

const NativeAppleMusic = registerPlugin<AppleMusicPlugin>("AppleMusic");

export interface LinkedAccountsStatus {
    accounts: {
        spotify?: { id: string; linkedAt?: number };
        appleMusic?: { linkedAt: number; storefront: string; needsToken: boolean };
    };
    /** Whether this server offers Apple Music at all. */
    appleMusicAvailable: boolean;
}

/** The listener has no Apple Music subscription, which Tempo needs to see what they play. */
export class AppleMusicNoSubscriptionError extends Error {
    constructor() {
        super("Tempo can only see what you play with an Apple Music subscription.");
    }
}

/** Linking was not allowed, or did not finish, so there is nothing to link. */
export class AppleMusicNotAllowedError extends Error {
    constructor(public status: AuthorizationStatus) {
        super(status === "restricted"
            ? "Apple Music is restricted on this device."
            : status === "failed"
                ? "Apple's sign-in did not finish. If your browser blocked a pop-up, allow pop-ups for Tempo and try again."
                : Capacitor.getPlatform() === "ios"
                    ? "Tempo needs access to Apple Music to link it. You can allow it in Settings › Tempo."
                    : "Tempo was not allowed to use Apple Music.");
    }
}

/*
 * Which Tempo account linked Apple Music on this device, if one did.
 *
 * The token MusicKit holds belongs to whoever signed in to Apple Music here,
 * which after somebody signs out of Tempo is not necessarily whoever signs in
 * next. So a token is only ever handed over for the account that linked it
 * here: never for one that linked from another device, and never after
 * signing out.
 */
const LINKED_HERE_KEY = "tempo.apple-music.linked-for";

function linkedHere(): string | null {
    try {
        return window.localStorage.getItem(LINKED_HERE_KEY);
    } catch {
        return null;
    }
}

function setLinkedHere(tempoId: string | null) {
    try {
        if (tempoId)
            window.localStorage.setItem(LINKED_HERE_KEY, tempoId);
        else
            window.localStorage.removeItem(LINKED_HERE_KEY);
    } catch { }
}

/**
 * Whether Apple Music can be linked from here.
 *
 * Not from the Android app: MusicKit's Android sign-in hands off to the Apple
 * Music app and needs Apple's own SDK, and MusicKit on the Web signs in through
 * a pop-up an app's web view does not open.
 */
export function canLinkAppleMusicHere() {
    const platform = Capacitor.getPlatform();

    return platform === "ios" || platform === "web";
}

/* ---------- MusicKit on the Web ---------- */

const MUSICKIT_JS = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

interface MusicKitInstance {
    isAuthorized: boolean;
    musicUserToken?: string;
    authorize(): Promise<string>;
    unauthorize(): Promise<void>;
}

interface MusicKitGlobal {
    configure(options: { developerToken: string; app: { name: string; build?: string } }): Promise<MusicKitInstance>;
    getInstance(): MusicKitInstance;
}

let musicKitLoading: Promise<MusicKitGlobal> | undefined;

function loadMusicKit(): Promise<MusicKitGlobal> {
    const existing = (window as unknown as { MusicKit?: MusicKitGlobal }).MusicKit;

    if (existing)
        return Promise.resolve(existing);

    if (!musicKitLoading) {
        musicKitLoading = new Promise((resolve, reject) => {
            const script = document.createElement("script");

            script.src = MUSICKIT_JS;
            script.async = true;
            script.onerror = () => {
                musicKitLoading = undefined;
                reject(new Error("MusicKit could not be loaded"));
            };

            document.addEventListener("musickitloaded", () => {
                const loaded = (window as unknown as { MusicKit?: MusicKitGlobal }).MusicKit;

                if (loaded)
                    resolve(loaded);
                else
                    reject(new Error("MusicKit loaded without MusicKit"));
            }, { once: true });

            document.head.appendChild(script);
        });
    }

    return musicKitLoading;
}

let configuredWith: string | undefined;

/**
 * The configured MusicKit instance, once there is one. Kept so linking can
 * open Apple's sign-in straight from the tap: a browser only lets a page open
 * a pop-up while it is still answering one, and a request or a script load in
 * between is enough for Safari to block it.
 */
let preparedMusicKit: MusicKitInstance | undefined;

async function webMusicKit(developerToken: string): Promise<MusicKitInstance> {
    const MusicKit = await loadMusicKit();

    if (configuredWith !== developerToken) {
        await MusicKit.configure({ developerToken, app: { name: "Tempo" } });
        configuredWith = developerToken;
    }

    preparedMusicKit = MusicKit.getInstance();

    return preparedMusicKit;
}

/* ---------- Either ---------- */

/**
 * The listener's music user token.
 *
 * @param ask whether the listener may be asked. Only linking asks; opening the
 *            app only takes a token from somebody who has already said yes.
 * @param fresh skip any cached token, because the server has said it was refused
 */
async function musicUserToken(developerToken: string, ask: boolean, fresh: boolean): Promise<UserTokenResult> {
    if (Capacitor.getPlatform() === "ios") {
        return (ask
            ? NativeAppleMusic.authorize({ developerToken })
            : NativeAppleMusic.userToken({ developerToken, fresh }));
    }

    const music = await webMusicKit(developerToken);

    if (music.isAuthorized && music.musicUserToken && !fresh)
        return { status: "authorized", userToken: music.musicUserToken };

    // The web has no way to get a new token without signing in again, and the
    // one it holds is the one refused
    if (!ask)
        return { status: "notDetermined" };

    // authorize() hands back the token it already holds rather than signing
    // in, and that token is the refused one, or somebody else's
    await signOutOfMusicKit(music);

    return webAuthorize(music);
}

async function signOutOfMusicKit(music: MusicKitInstance) {
    if (music.isAuthorized)
        await music.unauthorize().catch(ex => console.warn("MusicKit would not sign out:", ex));
}

async function webAuthorize(music: MusicKitInstance): Promise<UserTokenResult> {
    try {
        const userToken = await music.authorize();

        return (userToken ? { status: "authorized", userToken } : { status: "failed" });
    } catch {
        // Rejected alike when the pop-up is blocked, closed, or Apple says no
        return { status: "failed" };
    }
}

/* ---------- Tempo's server ---------- */

async function api<T>(path: string, headers: Record<string, string>, init: RequestInit = {}): Promise<T> {
    const res = await fetchThroughRateLimit(API_URL + path, {
        ...init,
        headers: { "Content-Type": "application/json", ...headers, ...(init.headers as Record<string, string>) },
        credentials: "include",
    });

    const body = await res.json().catch(() => null);

    if (!res.ok)
        throw new Error(body?.message ?? `Request failed (${res.status})`);

    return body as T;
}

export function getLinkedAccounts(headers: Record<string, string>) {
    return api<LinkedAccountsStatus>("/me/accounts", headers);
}

async function developerToken(headers: Record<string, string>) {
    return (await api<{ token: string; expiresAt: number }>("/apple-music/developer-token", headers)).token;
}

/**
 * @param refresh only update an existing link; see PUT /me/accounts/apple-music
 */
function sendUserToken(headers: Record<string, string>, userToken: string, refresh: boolean) {
    return api<Pick<LinkedAccountsStatus, "accounts">>("/me/accounts/apple-music", headers, {
        method: "PUT",
        body: JSON.stringify({ userToken, refresh }),
    });
}

/**
 * Gets MusicKit ready before the listener asks to link, so that asking opens
 * Apple's sign-in straight away. Only does anything in a browser.
 *
 * Signs MusicKit out, too, ahead of the tap: it would otherwise answer the tap
 * with the token it holds — refused, or another person's — without asking
 * anybody anything, and signing out after the tap is a wait the pop-up does
 * not survive.
 */
export async function prepareAppleMusicLink(headers: Record<string, string>) {
    if (Capacitor.getPlatform() !== "web")
        return;

    const music = preparedMusicKit ?? await webMusicKit(await developerToken(headers));

    await signOutOfMusicKit(music);
}

/**
 * Links Apple Music, asking the listener for access if they have not given it.
 *
 * Throws AppleMusicNotAllowedError when they say no, and
 * AppleMusicNoSubscriptionError when there is nothing Tempo could see.
 */
export async function linkAppleMusic(headers: Record<string, string>, tempoId: string) {
    // In a browser, before anything is awaited; see preparedMusicKit. Only
    // once it is signed out, or it answers with the token it already holds
    const prepared = (Capacitor.getPlatform() === "web" && preparedMusicKit && !preparedMusicKit.isAuthorized
        ? webAuthorize(preparedMusicKit)
        : undefined);

    const result = await (prepared ?? musicUserToken(await developerToken(headers), true, true));

    if (result.status !== "authorized" || !result.userToken)
        throw new AppleMusicNotAllowedError(result.status);

    if (result.canPlayCatalogContent === false)
        throw new AppleMusicNoSubscriptionError();

    const linked = await sendUserToken(headers, result.userToken, false);

    setLinkedHere(tempoId);

    return linked;
}

export async function unlinkAppleMusic(headers: Record<string, string>) {
    const unlinked = await api<Pick<LinkedAccountsStatus, "accounts">>("/me/accounts/apple-music", headers, { method: "DELETE" });

    setLinkedHere(null);

    return unlinked;
}

/**
 * Forgets that Apple Music was linked here, for signing out of Tempo. MusicKit
 * on the Web is signed out too where it is loaded; where it is not, linking
 * again signs it out first anyway.
 */
export function forgetAppleMusicHere() {
    setLinkedHere(null);

    if (preparedMusicKit)
        signOutOfMusicKit(preparedMusicKit).catch(() => { });
}

let refreshedThisLaunch = false;

/**
 * Hands the server the listener's current token, if they linked Apple Music
 * on this device. Once a launch, and never asks the listener anything.
 *
 * Quietly does nothing wherever it cannot: linked elsewhere or not at all,
 * not on a device that can link, access withdrawn in Settings. The server
 * keeps its link waiting for a token, and the settings page says so. Asks
 * the server nothing, and loads nothing, on a device that never linked.
 */
export async function refreshAppleMusicLink(headers: Record<string, string>, tempoId: string) {
    if (refreshedThisLaunch || !canLinkAppleMusicHere() || !tempoId || linkedHere() !== tempoId)
        return;

    refreshedThisLaunch = true;

    const status = await getLinkedAccounts(headers);
    const link = status.accounts.appleMusic;

    if (!status.appleMusicAvailable || !link) {
        // Unlinked somewhere else since
        setLinkedHere(null);

        return;
    }

    const token = await developerToken(headers);
    const result = await musicUserToken(token, false, link.needsToken);

    if (result.status === "authorized" && result.userToken)
        await sendUserToken(headers, result.userToken, true);
}
