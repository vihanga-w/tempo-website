import { UpdateEvent } from "@/lib/live-ingest";
import { getSizedImageUrl } from "@/lib/sized-img";
import { Drawer, DrawerOverlay, DrawerContent, DrawerHeader, DrawerBody, useDisclosure, Image, Box } from "@chakra-ui/react";
import { RefObject, useEffect, useRef } from "react";
import { MdClose } from "react-icons/md";

function useOutsideAlerter(ref: RefObject<any>, cb: () => void) {
    useEffect(() => {
        function handleClickOutside(event: any) {
            if (ref.current && !ref.current.contains(event.target))
                cb();
        }

        // Bind the event listener
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            // Unbind the event listener on clean up
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [ref]);
}

export default function ReactionDrawer({
    open,
    close,
    isOpen,
    item,
}: {
    open: () => void;
    close: () => void;
    isOpen: boolean;
    item: UpdateEvent["data"]["state"];
}) {
    const artwork = useRef<HTMLImageElement>(null);

    useOutsideAlerter(artwork, close);

    return (
        <Drawer placement="bottom" onClose={close} isOpen={isOpen} isFullHeight>
            <DrawerOverlay />
            {/* Full-height drawers render in a portal, so they are positioned
                against the viewport and the safe-area padding on body never
                reaches them - their content ran under the status bar and the
                notch. Padding rather than margin, so the background still
                reaches the screen edges. */}
            <DrawerContent background="rgba(0, 0, 0, 0.25)" backdropFilter="blur(5px)"
                paddingTop="var(--safe-area-inset-top, 0px)"
                paddingBottom="var(--safe-area-inset-bottom, 0px)"
            >
                {/* <DrawerHeader borderBottomWidth='1px' height="64px">
                    <Box display="flex" justifyContent="flex-end" marginTop="-4px">
                        <MdClose size="38px" />
                    </Box>
                </DrawerHeader> */}
                <DrawerBody>
                    <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                        <Image
                            src={getSizedImageUrl(item?.imageUrl ?? "", 240, 240)}
                            width="240px"
                            height="240px"
                            objectFit="cover"
                            draggable="false"
                            marginTop="40px"
                            marginBottom="60px"
                            borderRadius="10px"
                            ref={artwork}
                        />
                    </Box>
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}