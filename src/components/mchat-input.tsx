import { Input as ChakraInput, useColorModeValue, Text, Stack } from "@chakra-ui/react";
import React, { HTMLInputTypeAttribute, LegacyRef } from "react";

export const Input = React.forwardRef((props: {
    maxLength?: number,
    value?: string,
    width?: string,
    height?: string,
    type?: HTMLInputTypeAttribute,
    label?: string,
    addonposition?: "left" | "right",
    autoComplete?: React.HTMLInputAutoCompleteAttribute,
    valid?: number,
    placeholder?: string,
    onChange?: React.ChangeEventHandler<HTMLInputElement>,
    onFocus?: React.FocusEventHandler<HTMLInputElement>,
    onBlur?: React.FocusEventHandler<HTMLInputElement>,
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>,
}, ref: LegacyRef<HTMLInputElement>) => {
    const themeColourVariant = useColorModeValue("light", "dark");
    const textColour = useColorModeValue("text.light", "text.dark");

    return (<Stack gap="2px" width={props.width}>
        {props.label ? (<>
            <Text color={textColour}>{props.label}</Text>
        </>) : (<></>)}
        <ChakraInput
            ref={ref}
            {...props}
            value={props.value}
            onFocus={props.onFocus}
            onBlur={props.onBlur}
            autoComplete={props.autoComplete}
            placeholder={props.placeholder}
            type={props.type}
            width={props.width}
            height={props.height ?? "38px"}
            maxLength={props.maxLength}
            borderRadius="0"
            onChange={props.onChange}
            onKeyDown={props.onKeyDown}
            outline="none"
            background="rgba(255, 255, 255, 0.04)"
            borderLeft="none"
            borderRight="none"
            borderTop="none"
            borderBottom={`1px solid ${props.valid == 1 ? `var(--chakra-colors-accent-${themeColourVariant})` : "indianred"}`}
            transition=".25s"
            _hover={{}}
            _focus={{}}
        />
    </Stack>);
});