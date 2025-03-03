// Add a 'push' event listener to the service worker.
self.addEventListener('push', function(event) {
    // Extract data from the push event
    const data = event.data.json();

    // Options for the notification
    const options = {
        // The message text in the notification
        body: data.message,
        // The icon displayed in the notification
        icon: 'icons/ios/72.png'
    };

    // Use waitUntil to keep the service worker active
    // until the notification is displayed
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});