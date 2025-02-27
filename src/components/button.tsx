'use client';

import {
    Button, useColorModeValue,
} from "@chakra-ui/react";
import React, { MutableRefObject } from "react";

export function StyledBtn({
    type,
    width,
    height,
    marginLeft,
    marginRight,
    borderRadius,
    disabled,
    isLoading,
    children,
    onClick,
}: Readonly<{
    type?: "primary" | "secondary",
    width?: string,
    height?: string,
    marginLeft?: string,
    marginRight?: string,
    borderRadius?: string,
    disabled?: boolean,
    isLoading?: boolean,
    ref?: MutableRefObject<any>,
    children?: React.ReactNode,
    onClick?: React.MouseEventHandler<HTMLButtonElement>,
}>) {
    if (!type) type = "primary";

    // const theme = useColorModeValue("light", "dark");
    const btnBgColourPrimary = useColorModeValue("primary.light", "primary.dark");
    const btnBgColourSecondary = useColorModeValue("secondary.light", "secondary.dark");
    const textColour = useColorModeValue("text.light", "text.dark");

    return (
        <Button
            width={width ?? "100%"}
            height={height ?? "48px"}
            borderRadius={borderRadius ?? "12px"}
            background={type == "primary" ? btnBgColourPrimary : btnBgColourSecondary}
            color={type == "primary" ? "text.dark" : textColour}
            isDisabled={disabled}
            isLoading={isLoading}
            pointerEvents={(isLoading || disabled) ? "none" : "all"}
            marginLeft={marginLeft ?? "24px"}
            marginRight={marginRight ?? "24px"}
            onClick={onClick}
            _hover={{}}
            _active={{}}
        >{children}</Button>
    )
};