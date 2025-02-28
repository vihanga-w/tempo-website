import { useDisclosure, Modal as ChakraModal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Button, useColorModeValue } from "@chakra-ui/react";

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
            />
            <ModalContent background="#181818">
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