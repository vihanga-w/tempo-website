import { UpdateEvent } from "@/lib/live-ingest";
import { Drawer, DrawerOverlay, DrawerContent, DrawerHeader, DrawerBody, useDisclosure, Image, Box, Text } from "@chakra-ui/react";
import { RefObject, useEffect, useRef, useState } from "react";
import { MdClose } from "react-icons/md";

export default function LegalDrawer({
    open,
    close,
    isOpen,
    page,
}: {
    open: () => void;
    close: () => void;
    isOpen: boolean;
    page: "terms" | "privacy";
}) {
    const [loaded, setLoaded] = useState<boolean>(false);

    useEffect(() => {
        setLoaded(false);
    }, [page]);
    
    return (
        <Drawer placement="bottom" onClose={close} isOpen={isOpen} isFullHeight>
            <DrawerOverlay background="#0D0D0E" />
            {/* Full-height drawers render in a portal, so they are positioned
                against the viewport and the safe-area padding on body never
                reaches them - their content ran under the status bar and the
                notch. Padding rather than margin, so the background still
                reaches the screen edges. */}
            <DrawerContent background="#0D0D0E"
                paddingTop="var(--safe-area-inset-top, 0px)"
                paddingBottom="var(--safe-area-inset-bottom, 0px)"
            >
                <DrawerHeader borderBottomWidth='1px' height="64px" display="flex" width="100vw">
                    <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
                        <Text>{page == "terms" ? "Terms & Conditions" : "Privacy Policy"}</Text>
                        <MdClose size="38px" onClick={() => {
                            close();
                        }} />
                    </Box>
                </DrawerHeader>
                <DrawerBody padding="0">
                    <iframe src={`/${page}#embed`} style={{
                        width: "100vw",
                        height: "100vh",
                        opacity: (loaded ? 1: 0),
                        transition: ".3s",
                    }} onLoad={() => {
                        setTimeout(() => {
                            setLoaded(true);
                        }, 100);
                    }} />
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}