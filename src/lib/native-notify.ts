import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

import { API_URL, NOTIF_PROCESSED_KEY, NOTIF_SUB_ID_KEY } from "./const";

/**
 * Notifications for the installed app.
 *
 * None of the web push flow works here. Apple offers the Push API to Safari and
 * to web apps on the home screen, but not inside the WKWebView this runs in, so
 * there is no service worker to subscribe and no VAPID key to subscribe with -
 * `pushSupported()` is false and the whole thing returns early. What the app has
 * instead is a token from Apple, handed over once and used by the server to send
 * through APNs.
 *
 * The device id is the same one the web flow keeps, so a device that used to be
 * a home-screen web app and is now the real thing does not end up filed twice.
 */

/** Registration only ever needs doing once per launch. */
let registered = false;

const deviceId = (): string => {
    const stored = window.localStorage.getItem(NOTIF_SUB_ID_KEY);

    if (stored)
        return stored;

    const fresh = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

    window.localStorage.setItem(NOTIF_SUB_ID_KEY, fresh);

    return fresh;
};

/**
 * Waits for the token Apple sends back, which arrives on an event rather than
 * from the call that asks for it.
 *
 * Bounded, because neither event is guaranteed to fire: without the push
 * capability on the build, `register()` resolves and nothing follows it, and an
 * unbounded wait there would hang the caller for the rest of the session.
 */
const awaitToken = (): Promise<string> => new Promise((resolve, reject) => {
    let settled = false;

    // Both listeners are removed once one of them has answered. This can be
    // called again - from settings, or on a later launch - and a listener left
    // behind would still be holding the promise from the attempt before it.
    const handles: { remove: () => Promise<void> }[] = [];

    const settle = (done: () => void) => {
        if (settled)
            return;

        settled = true;

        clearTimeout(timer);
        handles.forEach(h => { h.remove().catch(() => { }); });

        done();
    };

    const timer = setTimeout(
        () => settle(() => reject(new Error("Apple did not return a device token"))),
        15e3,
    );

    PushNotifications.addListener("registration", (token) => {
        settle(() => resolve(token.value));
    }).then(h => handles.push(h));

    PushNotifications.addListener("registrationError", (error) => {
        settle(() => reject(new Error(String(error?.error ?? "Registration failed"))));
    }).then(h => handles.push(h));

    PushNotifications.register();
});

const fileToken = async (
    deviceToken: string,
    userId: string,
    authHeaders: Record<string, string>,
) => {
    const res = await fetch(API_URL + "/notify/register-device", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify({
            id: `${userId}-${deviceId()}`,
            deviceToken,
        }),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");

        throw new Error(`Failed to register device for notifications (${res.status}) ${detail}`);
    }
};

/** Whether this device can receive notifications through the app. */
const nativePushSupported = (): boolean => (
    Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("PushNotifications")
);

/**
 * What this device's notifications are currently doing, in the same words the
 * web flow uses so the settings UI does not need to know which it is talking to.
 */
const getNativePushStatus = async (): Promise<"unsupported" | "denied" | "off" | "on"> => {
    if (!nativePushSupported())
        return "unsupported";

    const { receive } = await PushNotifications.checkPermissions();

    if (receive === "denied")
        return "denied";

    if (receive !== "granted")
        return "off";

    // Granted says the user agreed, not that the server knows where to send:
    // the record lives on the server, and only the marker below says it got
    // there. Same distinction the web flow draws between permission and a
    // live subscription.
    return (window.localStorage.getItem(NOTIF_PROCESSED_KEY) ? "on" : "off");
};

/**
 * Asks for permission if it has not been asked for, then hands the token to the
 * server.
 *
 * @param prompt runs before iOS shows its own dialog, so the app can explain
 *               what it is about to ask for. Returning false means the user said
 *               no to us and iOS is never asked - which matters, because iOS
 *               only ever asks once, and a refusal there can only be undone in
 *               Settings.
 */
const enableNativePush = async (
    userId: string,
    authHeaders: Record<string, string>,
    prompt?: () => Promise<boolean>,
): Promise<{ ok: true } | { ok: false; reason: "unsupported" | "denied" | "dismissed" | "failed"; detail?: string }> => {
    if (!nativePushSupported())
        return { ok: false, reason: "unsupported" };

    try {
        let { receive } = await PushNotifications.checkPermissions();

        if (receive === "denied")
            return { ok: false, reason: "denied" };

        if (receive !== "granted") {
            if (prompt && !(await prompt()))
                return { ok: false, reason: "dismissed" };

            ({ receive } = await PushNotifications.requestPermissions());
        }

        if (receive === "denied")
            return { ok: false, reason: "denied" };

        if (receive !== "granted")
            return { ok: false, reason: "dismissed" };

        // A token is only good for the install that received it: iOS reissues
        // on restore from backup, on reinstall, and occasionally on its own. So
        // this runs on every launch rather than once ever, and the server keys
        // on the device id so re-filing overwrites instead of accumulating.
        const token = await awaitToken();

        registered = true;

        await fileToken(token, userId, authHeaders);

        window.localStorage.setItem(NOTIF_PROCESSED_KEY, "true");

        return { ok: true };
    } catch (e) {
        console.warn("Failed to enable notifications on this device:", e);

        return { ok: false, reason: "failed", detail: (e instanceof Error ? e.message : undefined) };
    }
};

/**
 * Brings an app that has already been granted permission back to a working
 * state, without asking again.
 *
 * @returns false when the user has yet to be asked, so the caller knows to run
 *          the first-run prompt.
 */
const restoreNativePush = async (
    userId: string,
    authHeaders: Record<string, string>,
): Promise<boolean> => {
    if (!nativePushSupported())
        return true;

    const { receive } = await PushNotifications.checkPermissions();

    if (receive === "denied")
        return true;

    if (receive !== "granted")
        return false;

    if (registered)
        return true;

    const result = await enableNativePush(userId, authHeaders);

    // A failure to re-file is not evidence the user needs asking again — they
    // already agreed, and asking twice for the same thing is worse than a
    // notification arriving late.
    return (result.ok || result.reason !== "dismissed");
};

/**
 * Tapping a notification should open what it is about.
 *
 * Set up once at startup, separately from permission, because the listener has
 * to exist before the tap that woke the app is delivered.
 */
const onNativeNotificationTap = (handler: (data: Record<string, unknown>) => void) => {
    if (!nativePushSupported())
        return;

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        handler((action.notification?.data ?? {}) as Record<string, unknown>);
    });
};

export {
    nativePushSupported,
    getNativePushStatus,
    enableNativePush,
    restoreNativePush,
    onNativeNotificationTap,
};
