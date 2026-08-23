// Add a 'push' event listener to the service worker.
self.addEventListener('push', function (event) {
    // A push that resolves without showing anything is not a silent no-op: the
    // browser reports the handler as having failed its user-visible obligation,
    // and platforms may substitute their own "site updated in the background"
    // notice or, after enough of them, revoke the subscription outright. So
    // every path here ends in a showNotification, including the broken ones —
    // a wrong notification is diagnosable, a missing one is not.
    event.waitUntil((async () => {
        let data;

        try {
            data = event.data ? event.data.json() : {};
        } catch (err) {
            console.error('[notify-sw] push payload was not JSON:', err);

            data = {};
        }

        const title = (typeof data.title === 'string' && data.title !== '' ? data.title : 'Tempo');
        const body = (typeof data.message === 'string' ? data.message : '');

        try {
            await self.registration.showNotification(title, {
                body: body,
                // Absolute, so it resolves against the origin rather than
                // wherever the service worker happens to be scoped
                icon: '/icons/ios/72.png',
            });
        } catch (err) {
            console.error('[notify-sw] showNotification failed:', err);
        }
    })());
});
