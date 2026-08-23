import { API_URL, NOTIF_PROCESSED_KEY, NOTIF_VAPID_KEY } from "./const";

// Function to convert Base64URL to Uint8Array
const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
};

/**
 * Fetches the application server key from the API.
 *
 * This used to be a constant in the page. A hardcoded copy stops matching the
 * moment the server's key changes, and nothing about the failure is visible
 * here — the browser subscribes happily and the push service rejects every
 * send. Asking the server means the two cannot drift apart.
 */
const fetchVapidPublicKey = async (): Promise<string> => {
    const res = await fetch(API_URL + "/notify/pubkey");

    if (!res.ok)
        throw { errorCode: "VapidPublicKeyUnavailable", status: res.status };

    const body = await res.json();
    const publicKey = body?.data?.publicKey;

    if (typeof publicKey !== "string" || publicKey === "")
        throw { errorCode: "VapidPublicKeyUnavailable" };

    return publicKey;
};

/** The key a subscription was actually created with, base64url encoded. */
const subscriptionPublicKey = (subscription: PushSubscription): string | null => {
    const raw = subscription.options?.applicationServerKey;

    if (!raw)
        return null;

    const bytes = new Uint8Array(raw as ArrayBuffer);

    let binary = "";

    for (let i = 0; i < bytes.length; ++i)
        binary += String.fromCharCode(bytes[i]);

    return window.btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
};

/**
 * Clears this device's notification state when the server is signing with a
 * different VAPID key than the one it last subscribed under.
 *
 * Returns true when a reset happened, meaning the caller should run the
 * subscribe flow again — the permission prompt included, since the old
 * subscription is gone.
 *
 * Deliberately does nothing when the key cannot be fetched: a backend blip must
 * not throw away a subscription that is still perfectly good.
 */
const resetStaleSubscription = async (): Promise<boolean> => {
    let serverKey: string;

    try {
        serverKey = await fetchVapidPublicKey();
    } catch (e) {
        console.warn("Could not check the server's VAPID key, leaving the subscription alone:", e);

        return false;
    }

    const registration = ('serviceWorker' in navigator ? await navigator.serviceWorker.ready : null);
    const existing = (await registration?.pushManager?.getSubscription()) ?? null;

    const knownKey = window.localStorage.getItem(NOTIF_VAPID_KEY);

    // The marker is written on every successful subscribe, so its absence means
    // either no subscription or one from before this check existed — and the
    // latter is exactly the population that has to be reset.
    const current = (existing ? subscriptionPublicKey(existing) : knownKey);

    if (current === serverKey) {
        // Backfills the marker for a device that is already on the right key
        window.localStorage.setItem(NOTIF_VAPID_KEY, serverKey);

        return false;
    }

    if (!existing && !knownKey)
        return false;

    console.log("Push subscription was made with a stale VAPID key, resetting it");

    if (existing) {
        try {
            await existing.unsubscribe();
        } catch (e) {
            console.warn("Failed to unsubscribe the stale push subscription:", e);
        }
    }

    try {
        window.localStorage.removeItem(NOTIF_VAPID_KEY);
        window.localStorage.removeItem(NOTIF_PROCESSED_KEY);
    } catch { }

    return true;
};

// Hook for subscribing to push notifications
const useSubscribe = () => {
    const getSubscription = async () => {
        // Check for ServiceWorker and PushManager support
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            throw { errorCode: "ServiceWorkerAndPushManagerNotSupported" };
        }

        // Wait for Service Worker to be ready
        const registration = await navigator.serviceWorker.ready;

        // Check for pushManager in registration
        if (!registration.pushManager) {
            throw { errorCode: "PushManagerUnavailable" };
        }

        const publicKey = await fetchVapidPublicKey();

        // Check for existing subscription
        const existingSubscription = await registration.pushManager.getSubscription();

        if (existingSubscription) {
            // Only an existing subscription on the current key is worth keeping.
            // One on an older key cannot receive anything, so it is replaced
            // rather than reported back as already-subscribed.
            if (subscriptionPublicKey(existingSubscription) === publicKey)
                throw { errorCode: "ExistingSubscription", sub: existingSubscription };

            try {
                await existingSubscription.unsubscribe();
            } catch (e) {
                console.warn("Failed to unsubscribe a subscription on an old VAPID key:", e);
            }
        }

        // Convert VAPID key for use in subscription
        const convertedVapidKey = urlBase64ToUint8Array(publicKey);

        const subscription = await registration.pushManager.subscribe({
            applicationServerKey: convertedVapidKey,
            userVisibleOnly: true,
        });

        // Recorded only once the browser has accepted the key, so the marker
        // never claims a subscription that does not exist
        window.localStorage.setItem(NOTIF_VAPID_KEY, publicKey);

        return subscription;
    };

    return { getSubscription };
};

/**
 * Waits for the service worker that will receive pushes.
 *
 * This used to register notify-sw.js itself. That did not add a worker — a
 * scope only ever has one registration, and next-pwa already claims the root
 * with /sw.js — so the two overwrote each other and whichever registered last
 * decided whether a push handler existed at all. /sw.js won, and it had none.
 * The handler is imported into it now (see importScripts in next.config.mjs),
 * leaving nothing to register here.
 *
 * The wait is bounded because serviceWorker.ready never rejects: with no
 * registration at all it simply hangs, taking the subscribe flow down with it
 * and reporting nothing.
 */
const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) {
        console.warn('Service Worker is not supported in this browser.');

        return;
    }

    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 10e3));

    const registration = await Promise.race([navigator.serviceWorker.ready, timeout]);

    if (!registration) {
        console.warn('No service worker became ready — push notifications cannot be displayed.');

        return;
    }

    console.log('Service Worker ready:', registration.active?.scriptURL);
};

// Function to remove the subscription
const removeSubscription = async () => {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
                try { window.localStorage.removeItem(NOTIF_VAPID_KEY); } catch { }
                console.log('Push subscription removed successfully.');
            } else {
                console.log('No push subscription found.');
            }
        } catch (error) {
            console.error('Failed to remove push subscription:', error);
        }
    } else {
        console.warn('Service Worker is not supported in this browser.');
    }
};

export { urlBase64ToUint8Array, useSubscribe, registerServiceWorker, removeSubscription, fetchVapidPublicKey, resetStaleSubscription };