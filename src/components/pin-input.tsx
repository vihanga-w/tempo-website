import { HStack, VStack, Button, Box, Grid, Circle, useColorModeValue, Text, Spinner } from "@chakra-ui/react";
import React from "react";
import { useRef, useState } from "react";
import { FaCheck, FaDeleteLeft } from "react-icons/fa6";

export function PinInput({
    onPinEntered,
    onChange,
    maxWidth,
    children,
    showPin,
    isProcessing,
}: Readonly<{
    onPinEntered: (pin: string) => void,
    onChange?: (pin: string) => void,
    maxWidth?: string,
    children?: React.ReactNode,
    showPin?: boolean,
    isProcessing?: boolean,
}>) {
    const [pin, setPin] = useState<string>("");

    const themeColourVariant = useColorModeValue("primary.light", "primary.dark");

    function handlePinChange(newPin: string) {
        if (newPin.length > 6) return;

        setPin(newPin);
        onChange?.(newPin);
    }

    function handlePinSubmit() {
        if (pin.length < 6) {
            return;
        }

        onPinEntered(pin);
    }

    function handleButtonClick(value: string) {
        handlePinChange(pin + value);
    }

    function handleDelete() {
        handlePinChange(pin.slice(0, -1));
    }

    return (
        <VStack spacing={10} width="100%" maxWidth={maxWidth} height="100%" alignItems="center">
            <Box height="42px" marginBottom="10%">
                <VStack spacing="5px" position="relative" textAlign="center">
                    {children}
                </VStack>
            </Box>
            <Box position="relative" marginTop="5%">
                {isProcessing ? (<>
                    <Spinner />
                </>) : (
                    <HStack spacing={6}>
                        {[...Array(6)].map((_, index) => (<>
                            {showPin && index < pin.length ? (<>
                                <Circle
                                    size="18px"
                                    fontSize="30px"
                                    paddingBottom={"3px"}
                                    borderColor={themeColourVariant}
                                >
                                    {pin[index]}
                                </Circle>
                            </>) : (<>
                                <Circle
                                    size="18px"
                                    background={index < pin.length ? themeColourVariant : "transparent"}
                                    border="1px solid"
                                    borderColor={themeColourVariant}
                                />
                            </>)}
                        </>))}
                    </HStack>
                )}
            </Box>
            <Box position="absolute" bottom="10%">
                <Grid templateColumns="repeat(3, 1fr)" gap={6} width="100%" justifyContent="center">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => (
                        <Box
                            width="100%"
                            height="100%"
                            paddingTop="100%"
                            borderRadius="50%"
                            position="relative"
                        >
                            <Box
                                width="100%"
                                height="100%"
                                top="0"
                                left="0"
                                borderRadius="inherit"
                                backgroundColor={themeColourVariant}
                                opacity="0.5"
                                position="absolute"
                            />
                            <Button
                                width="100%"
                                height="100%"
                                borderRadius="inherit"
                                background="transparent"
                                color="text.dark"
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                                position="absolute"
                                top="0"
                                left="0"
                                fontSize="calc(1em + 1vw)"
                                onClick={() => handleButtonClick(value.toString())}
                                style={{ opacity: 1 }}
                            >
                                {value}
                            </Button>
                        </Box>
                    ))}
                    
                    <Button
                        width="100%"
                        height="100%"
                        borderRadius="50%"
                        color="text.dark"
                        background="transparent"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        position="relative"
                        top="0"
                        left="0"
                        fontSize="calc(2.5em + 1vw)"
                        onClick={handleDelete}
                        paddingRight="20px"
                    >
                        <FaDeleteLeft />
                    </Button>
                    
                    <Box
                        width="100%"
                        height="100%"
                        paddingTop="100%"
                        borderRadius="50%"
                        position="relative"
                    >
                        <Box
                            width="100%"
                            height="100%"
                            top="0"
                            left="0"
                            borderRadius="inherit"
                            backgroundColor={themeColourVariant}
                            opacity="0.5"
                            position="absolute"
                        />
                        <Button
                            width="100%"
                            height="100%"
                            borderRadius="inherit"
                            background="transparent"
                            color="text.dark"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            position="absolute"
                            top="0"
                            left="0"
                            fontSize="calc(1em + 1vw)"
                            onClick={() => handleButtonClick("0")}
                            style={{ opacity: 1 }}
                        >
                            0
                        </Button>
                    </Box>

                    <Button
                        width="100%"
                        height="100%"
                        borderRadius="50%"
                        background="transparent"
                        color="text.dark"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        position="relative"
                        top="0"
                        left="0"
                        fontSize="calc(2.5em + 1vw)"
                        onClick={pin.length >= 6 ? handlePinSubmit : undefined}
                        disabled={isProcessing || pin.length < 6}
                        style={{ opacity: (isProcessing || pin.length < 6) ? 0.5 : 1, pointerEvents: (isProcessing || pin.length < 6) ? "none" : "auto" }}
                    >
                        <FaCheck />
                    </Button>
                </Grid>
            </Box>
        </VStack>
    )
}