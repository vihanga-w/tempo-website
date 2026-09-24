import UIKit
import Capacitor

/**
 * The app's web view, with the plugins that live in this project rather than
 * in a package registered on it. Capacitor finds packaged plugins by itself;
 * one compiled into the app has to be handed over.
 */
class TempoBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleMusicPlugin())
    }
}
