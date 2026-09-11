"use client";

/*
 * A bench for the liquid glass material and the action menu.
 *
 * The material is almost entirely a function of what is behind it — a blur and
 * a saturation boost over near-black is just grey — so judging it needs colour
 * and edges underneath, which is what the strips below are for. Development
 * only, like the other benches: see the `pageExtensions` note in
 * next.config.mjs.
 */

import { Box, Center, HStack, Text, VStack } from "@chakra-ui/react";
import { Capacitor } from "@capacitor/core";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import GlassActionMenu from "@/components/glass-action-menu";
import { glassSurface } from "@/lib/liquid-glass";

const SWATCHES = [
    "linear-gradient(135deg,#ff5f6d,#ffc371)",
    "linear-gradient(135deg,#4facfe,#00f2fe)",
    "linear-gradient(135deg,#a480ff,#3b44ff)",
    "linear-gradient(135deg,#0ba360,#3cba92)",
    "linear-gradient(135deg,#f7971e,#ffd200)",
    "linear-gradient(135deg,#ee0979,#ff6a00)",
];

export default function GlassBench() {
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState("friends");
    const [log, setLog] = useState<string[]>([]);
    const [haptics, setHaptics] = useState<string>("checking");
    const [insets, setInsets] = useState<string>("measuring");
    /*
     * Enabling the safe area is a round trip to the native side, so the first
     * reading is taken before it has landed. Re-read a beat later.
     */
    const [tick, setTick] = useState(0);
    const router = useRouter();

    /*
     * Whether the taps are actually landing.
     *
     * A simulator has no Taptic Engine, so nothing can be felt here and the
     * only thing worth checking is the part that can fail quietly: that the
     * call reaches the plugin and resolves. `feedback()` swallows rejections
     * by design, so if the native side were refusing, every device would go on
     * feeling like the web build and nothing would say so.
     */
    /*
     * What the two safe-area sources actually resolve to.
     *
     * The app reads both, and they do not come from the same place: `env()` is
     * the web view's own, and needs `viewport-fit=cover` to be anything but
     * zero, while `--safe-area-inset-*` is set by the plugin. The shell's title
     * is positioned off the first and its page padding off the second, so if
     * they disagree that is worth knowing rather than guessing at.
     */
    useEffect(() => {
        const t = setTimeout(() => setTick(1), 600);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        const probe = document.createElement("div");

        probe.style.position = "fixed";
        probe.style.visibility = "hidden";
        probe.style.paddingTop = "env(safe-area-inset-top, 0px)";
        probe.style.paddingBottom = "env(safe-area-inset-bottom, 0px)";
        document.body.appendChild(probe);

        const read = getComputedStyle(probe);
        const envTop = read.paddingTop;
        const envBottom = read.paddingBottom;

        probe.remove();

        const root = getComputedStyle(document.documentElement);
        const varTop = root.getPropertyValue("--safe-area-inset-top").trim() || "unset";
        const varBottom = root.getPropertyValue("--safe-area-inset-bottom").trim() || "unset";

        setInsets(`env ${envTop}/${envBottom} · var ${varTop}/${varBottom}`);
    }, [tick]);

    useEffect(() => {
        const native = Capacitor.isNativePlatform();
        const plugin = Capacitor.isPluginAvailable("Haptics");

        if (!native || !plugin) {
            setHaptics(`inactive (native: ${native}, plugin: ${plugin})`);
            return;
        }

        import("@capacitor/haptics")
            .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Medium }))
            .then(() => setHaptics("impact resolved — reaching the engine"))
            .catch(e => setHaptics(`impact REJECTED — ${e?.message ?? e}`));
    }, []);

    /*
     * The splash screen is configured not to hide itself, so whichever screen
     * comes up first has to take it down. In the app that is the real entry
     * point; here it would sit over the bench forever.
     */
    useEffect(() => {
        import("@capacitor/splash-screen")
            .then(({ SplashScreen }) => SplashScreen.hide())
            .catch(() => { /* Not running in the native shell. */ });

        /*
         * The same call the app's entry point makes. The insets have to be
         * measured with this done, because it is what the app does — and it
         * is what takes the web view edge-to-edge, which is the moment the
         * insets start to matter.
         */
        import("@capacitor-community/safe-area")
            .then(({ SafeArea, initialize }) => {
                initialize();
                return SafeArea.enable({
                    config: {
                        customColorsForSystemBars: true,
                        statusBarColor: "#0D0D0E",
                        statusBarContent: "dark",
                        navigationBarColor: "#0D0D0E",
                        navigationBarContent: "dark",
                    },
                });
            })
            .catch(() => { /* Not running in the native shell. */ });
    }, []);

    return (
        <Box minHeight="100vh" background="#0D0D0E" paddingBottom="220px">
            <VStack align="stretch" gap="14px" padding="20px" paddingTop="90px">
                <Text fontFamily="Inter" fontSize="13px" color="whiteAlpha.600">
                    current page: {page}
                </Text>
                <Text fontFamily="monospace" fontSize="12px" color="whiteAlpha.700">
                    haptics: {haptics}
                </Text>
                <Text fontFamily="monospace" fontSize="12px" color="whiteAlpha.700">
                    insets (top/bottom): {insets}
                </Text>

                {/*
                  * The native shell loads one URL and has no address bar, so
                  * reaching another bench would otherwise mean a rebuild.
                  *
                  * Routed rather than linked: Capacitor hands a plain <a> to
                  * the system browser, so an href here opens the bench in
                  * Safari instead of in the app. Pushing through the router
                  * never leaves the web view.
                  */}
                <HStack gap="14px" paddingTop="4px" paddingBottom="4px">
                    {[
                        ["/dev-leaderboard", "leaderboard"],
                        ["/dev-passport-page", "passport"],
                        ["/dev-preview", "profile"],
                    ].map(([href, label]) => (
                        <Box
                            key={href}
                            onPointerDown={() => router.push(href)}
                            fontFamily="monospace"
                            fontSize="12px"
                            color="#A480FF"
                            textDecoration="underline"
                        >
                            {label}
                        </Box>
                    ))}
                </HStack>

                {/* Something with colour and hard edges for the glass to sit over. */}
                {SWATCHES.map((g, i) => (
                    <HStack key={i} gap="12px">
                        <Box width="72px" height="72px" borderRadius="14px" background={g} flexShrink={0} />
                        <VStack align="start" gap="4px" flex="1">
                            <Text fontFamily="Inter" fontWeight="bold" fontSize="17px" color="text.color">
                                Track {i + 1}
                            </Text>
                            <Text fontFamily="Inter" fontSize="14px" color="whiteAlpha.600">
                                An artist, and an album it came from
                            </Text>
                        </VStack>
                    </HStack>
                ))}

                {/* The same material as a panel rather than a control. */}
                <Center {...glassSurface({ tier: "regular", radius: "22px" })} height="86px" marginTop="8px">
                    <Text fontFamily="Inter" fontWeight="semibold" fontSize="15px" color="text.color">
                        regular, as a panel
                    </Text>
                </Center>
                <Center {...glassSurface({ tier: "thin", radius: "22px" })} height="86px">
                    <Text fontFamily="Inter" fontWeight="semibold" fontSize="15px" color="text.color">
                        thin
                    </Text>
                </Center>
                <Center {...glassSurface({ tier: "thick", radius: "22px" })} height="86px">
                    <Text fontFamily="Inter" fontWeight="semibold" fontSize="15px" color="text.color">
                        thick
                    </Text>
                </Center>

                <VStack align="start" gap="2px" marginTop="10px">
                    {log.map((l, i) => (
                        <Text key={i} fontFamily="monospace" fontSize="12px" color="whiteAlpha.500">
                            {l}
                        </Text>
                    ))}
                </VStack>
            </VStack>

            <GlassActionMenu
                open={open}
                setOpen={setOpen}
                currentPage={page}
                onNavigate={(id, kind) => {
                    setLog(v => [...v, `${kind} -> ${id}`]);
                    if (kind === "page") setPage(id);
                }}
            />
        </Box>
    );
}
