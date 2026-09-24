import Foundation
import UIKit
import MediaPlayer
import BackgroundTasks

/**
 * Tells Tempo's server what the Music app is playing, while iOS lets Tempo run.
 *
 * The Apple Music API has no "now playing", and the server only learns of plays
 * every few minutes. The phone knows at once — but only while Tempo is running:
 * open, or for the few seconds after it goes to the background. So this reports
 * every change straight away, repeats itself every half minute while music
 * plays so the server can tell a quiet phone from a suspended one, and reports
 * once more on the way out. The server stops believing it when the heartbeats
 * stop (see device-now-playing.ts), and friends see "recently played" instead of
 * a frozen "now playing".
 *
 * Native rather than in the web app, whose JavaScript is paused the moment the
 * app leaves the screen — exactly when the last report matters most.
 *
 * It also reads the library's "last played" times whenever iOS lets Tempo run,
 * including in the background through app refresh, which gives plays of library
 * songs their real times.
 *
 * Nothing here keeps Tempo running. When iOS suspends it, it stops, and picks up
 * again when Tempo next runs.
 */
final class LiveTracker {
    static let shared = LiveTracker()

    static let refreshTaskId = "xyz.vihangaw.tempo.library-sync"

    private let defaults = UserDefaults.standard
    private let player = MPMusicPlayerController.systemMusicPlayer

    private var observers: [NSObjectProtocol] = []
    private var timer: Timer?
    private var lastSent: Snapshot?
    private var lastSentAt: Date = .distantPast
    private var running = false
    /** Main thread only. One library sync at a time, and not twice in a minute. */
    private var librarySyncing = false
    private var librarySyncStartedAt: Date = .distantPast
    /**
     * Main thread only. Whoever asked for a sync while one was running, told
     * when it finishes: a background refresh must not be marked done while
     * the sync it exists for is still going, or iOS suspends Tempo mid-sync.
     */
    private var librarySyncWaiters: [(Bool) -> Void] = []
    /**
     * Main thread only. Whether the player has been seen playing since Tempo
     * started watching it. A song left paused in the Music app yesterday is
     * not something anybody is listening to, and is reported as nothing.
     */
    private var seenPlaying = false

    /** How often the player is looked at while Tempo runs; its notifications are not dependable on their own. */
    private let pollInterval: TimeInterval = 2
    /** How often an unchanged report is repeated while music plays. */
    private let heartbeatInterval: TimeInterval = 30

    private enum Key {
        static let endpoint = "tempo.live.endpoint"
        static let authToken = "tempo.live.authToken"
        static let clientVersion = "tempo.live.clientVersion"
        static let deviceId = "tempo.live.deviceId"
        static let seq = "tempo.live.seq"
        static let librarySyncedAt = "tempo.live.librarySyncedAt"
    }

    private struct Snapshot: Equatable {
        var state: String
        var catalogId: String?
        var title: String?
        var artist: String?
        var album: String?
        var durationMs: Int
        var positionMs: Int

        /** The same moment in the same song, allowing for time having passed. */
        func sameAs(_ other: Snapshot, after elapsed: TimeInterval) -> Bool {
            guard state == other.state, catalogId == other.catalogId, title == other.title else { return false }

            let expected = other.positionMs + (state == "playing" ? Int(elapsed * 1000) : 0)

            // A seek, or the song starting again
            return abs(positionMs - expected) < 5000
        }
    }

    private init() { }

    // MARK: Configuration

    private var endpoint: String? { defaults.string(forKey: Key.endpoint) }
    private var authToken: String? { defaults.string(forKey: Key.authToken) }

    /**
     * This device, so the server can tell this phone's reports from an iPad's.
     *
     * The vendor identifier, not one kept in UserDefaults: those are restored
     * from a backup onto a new phone, and two phones with one id would reject
     * each other's reports. A stored one only where iOS has no vendor
     * identifier to give yet.
     */
    private var deviceId: String {
        if let id = UIDevice.current.identifierForVendor?.uuidString { return id }
        if let id = defaults.string(forKey: Key.deviceId) { return id }

        let id = UUID().uuidString

        defaults.set(id, forKey: Key.deviceId)

        return id
    }

    private func nextSeq() -> Int {
        let seq = defaults.integer(forKey: Key.seq) + 1

        defaults.set(seq, forKey: Key.seq)

        return seq
    }

    /**
     * Starts reporting for the signed-in listener. Kept across launches, so it
     * resumes on its own, in the background too, until stopped.
     */
    func start(endpoint: String, authToken: String, clientVersion: String?) {
        // On the main queue, like stop(), so the two happen in the order they
        // were asked for: a stop still waiting to run must not clear a start
        // that came after it
        DispatchQueue.main.async {
            self.defaults.set(endpoint, forKey: Key.endpoint)
            self.defaults.set(authToken, forKey: Key.authToken)
            self.defaults.set(clientVersion, forKey: Key.clientVersion)

            // A new token may be for somebody else: start over
            self.pause()
            self.resume()
        }
    }

    /**
     * Stops reporting and forgets who for — on signing out, or unlinking Apple
     * Music. The last report is a stop, so friends are not left watching.
     */
    func stop() {
        DispatchQueue.main.async {
            if self.endpoint != nil {
                self.send(Snapshot(state: "stopped", catalogId: nil, title: nil, artist: nil, album: nil, durationMs: 0, positionMs: 0), appState: "background")
            }

            self.forget()
        }
    }

    /** Main thread. Stops, and forgets who for. */
    private func forget() {
        pause()

        for key in [Key.endpoint, Key.authToken, Key.clientVersion, Key.librarySyncedAt] {
            defaults.removeObject(forKey: key)
        }

        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.refreshTaskId)
    }

    /** Resumes where a previous launch was configured. Call once the app has launched. */
    func resumeIfConfigured() {
        guard endpoint != nil, authToken != nil else { return }

        DispatchQueue.main.async { self.resume() }
    }

    // MARK: Watching the player

    private func resume() {
        guard !running, endpoint != nil, authToken != nil else { return }
        guard MPMediaLibrary.authorizationStatus() == .authorized else { return }

        running = true

        player.beginGeneratingPlaybackNotifications()

        let center = NotificationCenter.default

        observers = [
            center.addObserver(forName: .MPMusicPlayerControllerNowPlayingItemDidChange, object: player, queue: .main) { [weak self] _ in self?.check(force: true) },
            center.addObserver(forName: .MPMusicPlayerControllerPlaybackStateDidChange, object: player, queue: .main) { [weak self] _ in self?.check(force: true) },
            center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
                self?.startTimer()
                self?.check(force: true)
                self?.syncLibrary(completion: nil)
            },
            center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
                // The last word before iOS suspends Tempo, with the time it
                // takes to send it asked for
                self?.check(force: true, appState: "background")
                self?.stopTimer()
                self?.scheduleRefresh()
            },
        ]

        if UIApplication.shared.applicationState != .background {
            startTimer()
        }

        check(force: true)
        syncLibrary(completion: nil)
    }

    private func pause() {
        stopTimer()
        seenPlaying = false

        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers = []

        if running {
            player.endGeneratingPlaybackNotifications()
        }

        running = false
        lastSent = nil
    }

    private func startTimer() {
        guard timer == nil else { return }

        timer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { [weak self] _ in self?.check(force: false) }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func snapshot() -> Snapshot {
        let state: String

        switch player.playbackState {
        case .playing: state = "playing"
        case .paused, .interrupted, .seekingForward, .seekingBackward: state = "paused"
        default: state = "stopped"
        }

        guard let item = player.nowPlayingItem else {
            return Snapshot(state: "stopped", catalogId: nil, title: nil, artist: nil, album: nil, durationMs: 0, positionMs: 0)
        }

        if state == "playing" {
            seenPlaying = true
        } else if !seenPlaying {
            // Loaded, but not played since Tempo began watching: nothing is playing
            return Snapshot(state: "stopped", catalogId: nil, title: nil, artist: nil, album: nil, durationMs: 0, positionMs: 0)
        }

        let storeId = item.playbackStoreID

        return Snapshot(
            state: state,
            catalogId: (storeId.isEmpty || storeId == "0") ? nil : storeId,
            title: item.title,
            artist: item.artist,
            album: item.albumTitle,
            durationMs: Int(item.playbackDuration * 1000),
            positionMs: Int(max(0, player.currentPlaybackTime.isFinite ? player.currentPlaybackTime : 0) * 1000)
        )
    }

    /**
     * Reports the player if it changed, or if a heartbeat is due while playing.
     * `force` reports regardless, for a notification or the app leaving.
     */
    private func check(force: Bool, appState: String? = nil) {
        guard running else { return }

        let now = snapshot()
        let elapsed = Date().timeIntervalSince(lastSentAt)

        let changed = !(lastSent.map { now.sameAs($0, after: elapsed) } ?? false)

        // While playing, and while paused with Tempo open: the server only
        // counts a song as seen to its end when reports kept coming, and a
        // pause in front of the listener is still being watched
        let foreground = (UIApplication.shared.applicationState == .active)
        let heartbeatDue = ((now.state == "playing" || (foreground && now.title != nil)) && elapsed >= heartbeatInterval)

        // Nothing new, and no heartbeat due: nothing to say
        if !force && !changed && !heartbeatDue { return }

        let state = appState ?? (UIApplication.shared.applicationState == .background ? "background" : "foreground")

        send(now, appState: state)
    }

    // MARK: Sending

    private func request(path: String, body: [String: Any]) -> URLRequest? {
        guard let endpoint = endpoint, let token = authToken, let url = URL(string: endpoint + path),
              let data = try? JSONSerialization.data(withJSONObject: body) else { return nil }

        var request = URLRequest(url: url)

        request.httpMethod = "POST"
        request.httpBody = data
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(token, forHTTPHeaderField: "x-api-token")

        if let version = defaults.string(forKey: Key.clientVersion) {
            request.setValue(version, forHTTPHeaderField: "x-tempo-client")
        }

        return request
    }

    /**
     * Sends a request, asking iOS for the time to finish it even if Tempo is on
     * its way to the background.
     */
    private func post(_ request: URLRequest, completion: ((Int?) -> Void)? = nil) {
        var task: UIBackgroundTaskIdentifier = .invalid

        task = UIApplication.shared.beginBackgroundTask(withName: "tempo.live.report") {
            UIApplication.shared.endBackgroundTask(task)
            task = .invalid
        }

        URLSession.shared.dataTask(with: request) { [weak self] _, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode

            // Signed out, or Apple Music unlinked: stop, and forget the token,
            // rather than report every few seconds and every background refresh
            // to be refused every time. The app starts it again on its next
            // launch if the listener is still signed in and linked.
            if status == 401 || status == 403 || status == 409 {
                DispatchQueue.main.async { self?.forget() }
            }

            completion?(status)

            if task != .invalid {
                UIApplication.shared.endBackgroundTask(task)
                task = .invalid
            }
        }.resume()
    }

    private func send(_ snapshot: Snapshot, appState: String) {
        var body: [String: Any] = [
            "deviceId": deviceId,
            "seq": nextSeq(),
            "observedAt": Int(Date().timeIntervalSince1970 * 1000),
            "state": snapshot.state,
            "appState": appState,
            "positionMs": snapshot.positionMs,
        ]

        if let title = snapshot.title {
            var track: [String: Any] = [
                "title": title,
                "artist": snapshot.artist ?? "",
                "album": snapshot.album ?? "",
                "durationMs": snapshot.durationMs,
            ]

            if let catalogId = snapshot.catalogId { track["catalogId"] = catalogId }

            body["track"] = track
        }

        guard let request = request(path: "/me/now-playing", body: body) else { return }

        lastSent = snapshot
        lastSentAt = Date()

        post(request)
    }

    // MARK: The library

    /**
     * Sends the library songs played since the last look, with when each was
     * last played. Library songs only: a catalog song never added to the
     * library keeps no count, and the server's poll times those instead.
     */
    private func syncLibrary(completion: ((Bool) -> Void)?) {
        guard endpoint != nil, MPMediaLibrary.authorizationStatus() == .authorized else {
            completion?(false)
            return
        }

        // Launching asks twice (resuming, then becoming active), and a refresh
        // launch twice more; once is enough, and everybody waits for it
        if librarySyncing {
            if let completion = completion { librarySyncWaiters.append(completion) }
            return
        }

        guard Date().timeIntervalSince(librarySyncStartedAt) >= 60 else {
            completion?(true)
            return
        }

        librarySyncing = true
        librarySyncStartedAt = Date()

        let finish: (Bool) -> Void = { ok in
            DispatchQueue.main.async {
                self.librarySyncing = false

                let waiters = self.librarySyncWaiters

                self.librarySyncWaiters = []

                completion?(ok)
                waiters.forEach { $0(ok) }
            }
        }

        let since = defaults.object(forKey: Key.librarySyncedAt) as? Date ?? Date().addingTimeInterval(-6 * 3600)
        let startedAt = Date()
        // Here, on the main thread, where UIDevice may be asked
        let deviceId = self.deviceId

        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self = self else {
                finish(false)
                return
            }

            let items = (MPMediaQuery.songs().items ?? [])
                .filter { ($0.lastPlayedDate ?? .distantPast) > since && !$0.playbackStoreID.isEmpty && $0.playbackStoreID != "0" }
                .sorted { ($0.lastPlayedDate ?? .distantPast) > ($1.lastPlayedDate ?? .distantPast) }
                .prefix(500)
                .map { item -> [String: Any] in
                    [
                        "catalogId": item.playbackStoreID,
                        "lastPlayedAt": Int((item.lastPlayedDate ?? startedAt).timeIntervalSince1970 * 1000),
                        "durationMs": Int(item.playbackDuration * 1000),
                    ]
                }

            if items.isEmpty {
                self.defaults.set(startedAt, forKey: Key.librarySyncedAt)
                finish(true)
                return
            }

            guard let request = self.request(path: "/me/library-plays", body: ["deviceId": deviceId, "items": Array(items)]) else {
                finish(false)
                return
            }

            self.post(request) { status in
                let ok = (status.map { (200..<300).contains($0) } ?? false)

                // Only moved on once the server has them; otherwise the next
                // look sends them again
                if ok {
                    self.defaults.set(startedAt, forKey: Key.librarySyncedAt)
                }

                finish(ok)
            }
        }
    }

    // MARK: Background refresh

    /** Registers the app refresh task. Must run before the app finishes launching. */
    static func registerBackgroundRefresh() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshTaskId, using: nil) { task in
            guard let refresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }

            LiveTracker.shared.handleRefresh(refresh)
        }
    }

    /**
     * Asks iOS to wake Tempo some time later. When is iOS's choice — how often
     * somebody opens Tempo, battery, Low Power Mode — and never after they
     * swipe Tempo away, until they open it again.
     */
    private func scheduleRefresh() {
        guard endpoint != nil else { return }

        let request = BGAppRefreshTaskRequest(identifier: Self.refreshTaskId)

        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)

        try? BGTaskScheduler.shared.submit(request)
    }

    private func handleRefresh(_ task: BGAppRefreshTask) {
        // The next one first, so a refresh that is cut short still leads to another
        scheduleRefresh()

        task.expirationHandler = { task.setTaskCompleted(success: false) }

        DispatchQueue.main.async {
            guard self.endpoint != nil, MPMediaLibrary.authorizationStatus() == .authorized else {
                task.setTaskCompleted(success: false)
                return
            }

            // A snapshot of the player while awake, unless resuming just sent
            // one: it is believed only as long as a heartbeat would be, and
            // then lapses on its own
            if Date().timeIntervalSince(self.lastSentAt) > 5 {
                self.send(self.snapshot(), appState: "background")
            }

            self.syncLibrary { ok in task.setTaskCompleted(success: ok) }
        }
    }
}
