import { UpdateEvent } from "@/lib/live-ingest";
import { Drawer, DrawerOverlay, DrawerContent, DrawerHeader, DrawerBody, useDisclosure, Image, Box } from "@chakra-ui/react";
import { RefObject, useEffect, useRef } from "react";
import { MdClose } from "react-icons/md";

export default function LegalDrawer({
    open,
    close,
    isOpen,
}: {
    open: () => void;
    close: () => void;
    isOpen: boolean;
}) {
    return (
        <Drawer placement="bottom" onClose={close} isOpen={isOpen} isFullHeight>
            <DrawerOverlay />
            <DrawerContent background="rgba(0, 0, 0, 0.25)" backdropFilter="blur(5px)">
                {/* <DrawerHeader borderBottomWidth='1px' height="64px">
                    <Box display="flex" justifyContent="flex-end" marginTop="-4px">
                        <MdClose size="38px" />
                    </Box>
                </DrawerHeader> */}
                <DrawerBody>
                    <iframe src="/terms" />
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}