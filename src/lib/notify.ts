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

// Hook for subscribing to push notifications
const useSubscribe = ({ publicKey }: {
    publicKey: string;
}) => {
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

        // Check for existing subscription
        const existingSubscription = await registration.pushManager.getSubscription();

        if (existingSubscription) {
            throw { errorCode: "ExistingSubscription", sub: existingSubscription };
        }

        // Convert VAPID key for use in subscription
        const convertedVapidKey = urlBase64ToUint8Array(publicKey);
        
        return await registration.pushManager.subscribe({
            applicationServerKey: convertedVapidKey,
            userVisibleOnly: true,
        });
    };

    return { getSubscription };
};

// Function to register the service worker
const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/notify-sw.js');
            console.log('Service Worker registered successfully.');
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    } else {
        console.warn('Service Worker is not supported in this browser.');
    }
};

// Function to remove the subscription
const removeSubscription = async () => {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
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

export { urlBase64ToUint8Array, useSubscribe, registerServiceWorker, removeSubscription };