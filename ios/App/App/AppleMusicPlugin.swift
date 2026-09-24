import Foundation
import Capacitor
import MusicKit

/**
 * Apple Music sign-in, for linking it to Tempo.
 *
 * Tempo's server cannot sign anybody in to Apple Music: only MusicKit on the
 * device can, and what it hands back is a music user token. The web app gets
 * one here and sends it to the server, which reads the listener's recently
 * played tracks with it.
 *
 * A music user token expires without warning and cannot be renewed from the
 * server, so the app asks for the current one each time it opens. That never
 * shows the listener anything once they have allowed access: `userToken` only
 * answers for somebody already authorised, and only `authorize` asks.
 */
@objc(AppleMusicPlugin)
public class AppleMusicPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleMusicPlugin"
    public let jsName = "AppleMusic"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "userToken", returnType: CAPPluginReturnPromise),
    ]

    /** Whether the listener has let Tempo use Apple Music. Never asks. */
    @objc func authorizationStatus(_ call: CAPPluginCall) {
        call.resolve(["status": Self.describe(MusicAuthorization.currentStatus)])
    }

    /**
     * Asks the listener to let Tempo use Apple Music, if they have not been
     * asked, and answers with their token when they have allowed it.
     *
     * Takes { developerToken }. Answers { status, userToken?, canPlayCatalogContent? }.
     */
    @objc func authorize(_ call: CAPPluginCall) {
        guard let developerToken = Self.developerToken(call) else { return }

        Task {
            let status = await MusicAuthorization.request()

            await self.answer(call, status: status, developerToken: developerToken, fresh: true)
        }
    }

    /**
     * The listener's current token, when they have already allowed access.
     * Never asks them anything.
     *
     * Takes { developerToken, fresh? }. `fresh` skips MusicKit's cached token,
     * for when the server has said the cached one was refused.
     */
    @objc func userToken(_ call: CAPPluginCall) {
        guard let developerToken = Self.developerToken(call) else { return }

        let fresh = call.getBool("fresh") ?? false

        Task {
            await self.answer(call, status: MusicAuthorization.currentStatus, developerToken: developerToken, fresh: fresh)
        }
    }

    private func answer(_ call: CAPPluginCall, status: MusicAuthorization.Status, developerToken: String, fresh: Bool) async {
        guard status == .authorized else {
            call.resolve(["status": Self.describe(status)])
            return
        }

        do {
            let userToken = try await DefaultMusicTokenProvider().userToken(
                for: developerToken,
                options: fresh ? .ignoreCache : []
            )

            // Reading recently played tracks needs a subscription. Said here so
            // the app can explain, rather than linking an account that will
            // never have anything to read.
            let subscription = try? await MusicSubscription.current

            var result: [String: Any] = [
                "status": Self.describe(status),
                "userToken": userToken,
            ]

            if let subscription = subscription {
                result["canPlayCatalogContent"] = subscription.canPlayCatalogContent
            }

            call.resolve(result)
        } catch {
            call.reject("Apple Music did not give a user token: \(error.localizedDescription)", "USER_TOKEN", error)
        }
    }

    private static func developerToken(_ call: CAPPluginCall) -> String? {
        guard let token = call.getString("developerToken"), !token.isEmpty else {
            call.reject("developerToken is required")
            return nil
        }

        return token
    }

    private static func describe(_ status: MusicAuthorization.Status) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }
}
