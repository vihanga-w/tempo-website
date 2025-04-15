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
            <DrawerOverlay />
            <DrawerContent background="rgba(0, 0, 0, 0.25)" backdropFilter="blur(5px)">
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