import { Box, Center, Image } from "@chakra-ui/react";
import { MouseEventHandler } from "react";

export function SmallAddButton({
    alt,
    onClick,
    isCross,
    scale,
    opacity,
    active,
    zIndex,
}: Readonly<{
    alt?: string;
    onClick?: () => void;
    isCross?: boolean;
    scale?: number;
    opacity: string;
    active?: boolean;
    zIndex?: string;
}>) {
    return (<>
        {/* Make small "+" button virtually bigger so it is easier to click */}
        <Box
            onTouchStart={() => {
                if (!active) return;
                if (onClick) onClick();
            }}
            onPointerDown={() => {
                if (!active) return;
                if (onClick) onClick();
            }}
            zIndex={zIndex}
            /*
             * The whole control goes, not just its picture.
             *
             * Only the image was faded before, which leaves a 62-pixel target
             * sitting in the corner of pages that have nothing to add - and on
             * a page it does not belong to, a button that cannot be seen but
             * can still be found is worse than one that is simply there.
             */
            opacity={opacity ?? "1"}
            visibility={opacity === "0" ? "hidden" : "visible"}
            transition="opacity .15s"
            width="62px"
            height="62px"
            marginLeft="auto"
            marginRight="-17px"
            background="transparent"
            outline="none"
            _active={{
                background: "transparent",
            }}
            _focus={{
                background: "transparent",
            }}
            _hover={{
                background: "transparent",
            }}
        >
            <Center width="100%" height="100%">
                <Image
                    src={`/add-new-case.svg`}
                    alt={alt}
                    // preScale takes precedence over scale
                    width={scale !== undefined ? (scale * 26) + "px" : "26px"}
                    height={scale !== undefined ? (scale * 26) + "px" : "26px"}
                    userSelect="none"
                    transform={isCross ? "rotate(45deg)" : ""}
                    opacity={opacity ?? "1"}
                    style={{
                        WebkitTouchCallout: "none",
                        WebkitTapHighlightColor: "transparent",
                    }}
                    draggable={false}
                    transition=".15s"
                />
            </Center>
        </Box>
    </>);
}