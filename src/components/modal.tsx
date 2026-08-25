import { useDisclosure, Modal as ChakraModal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Button, useColorModeValue } from "@chakra-ui/react";

/**
 * Higher than anything the app pins in place. Dialogs ask for an answer, so
 * nothing should be able to sit on top of one.
 */
const MODAL_LAYER = 1000000000;

export function Modal({
    isOpen,
    onOpen,
    onClose,
    title,
    children,
    primaryButton,
    secondaryButton,
}: {
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
    title: string,
    children: React.ReactNode;
    primaryButton?: {
        text: string;
        callback: () => void;
    }
    secondaryButton?: {
        text: string;
        callback: () => void;
    }
}) {   
    const btnBgColourPrimary = useColorModeValue("primary.light", "primary.dark");
    const textColour = useColorModeValue("text.light", "text.dark");
    
    return (<>
        <ChakraModal isOpen={isOpen} onClose={onClose}>
            <ModalOverlay
                background="rgba(0, 0, 0, 0.5)"
                zIndex={MODAL_LAYER}
            />
            {/*
              * Above the app's own furniture.
              *
              * The page title and the add button are pinned with z-indices in
              * the hundreds of millions, and a Chakra modal sits at 1400 by
              * default - so every dialog opened underneath them, with the title
              * printed through its heading and a button floating over its
              * corner. containerProps because the content is positioned by a
              * wrapper, and styling the content alone leaves the wrapper where
              * it was.
              */}
            <ModalContent background="#181818" containerProps={{ zIndex: MODAL_LAYER }}>
                <ModalHeader>{title}</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    {children}
                </ModalBody>

                <ModalFooter>
                    {secondaryButton && (
                        <Button variant='ghost' onClick={secondaryButton.callback}>{secondaryButton.text}</Button>
                    )}
                    {primaryButton && (
                        <Button background={btnBgColourPrimary} color={textColour} mr={3} onClick={primaryButton.callback}>
                            {primaryButton.text}
                        </Button>
                    )}
                </ModalFooter>
            </ModalContent>
        </ChakraModal>
    </>);
}