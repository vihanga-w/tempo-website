import { Box } from "@chakra-ui/react";
import { useEffect, useState } from "react";

export class VisualViewPortHandler {
    private vViewportCheckLoop: NodeJS.Timeout | null = null;
    private cb: (offset: number) => void;

    constructor(cb: (offset: number) => void) {
        this.cb = cb;

        if (!window.visualViewport) return;

        // Check for visual viewport size changes (keyboard opened etc)
        window.visualViewport.onresize = (e) => {
            const offset = Math.ceil(window.innerHeight - window.visualViewport!.height);

            cb(offset);
            // setVisualViewportBottomOffset(offset);

            // If keyboard is displayed (frequently check viewport offset and move InteractiveButtonBox)
            if (!this.vViewportCheckLoop && offset > 0) {
                this.vViewportCheckLoop = setInterval(() => {
                    cb(Math.ceil(window.innerHeight - window.visualViewport!.height) - window.scrollY);
                }, 50);
            } else if (this.vViewportCheckLoop && offset == 0) {
                clearInterval(this.vViewportCheckLoop);
            }
        }
    }

    public forceUpdate() {
        setTimeout(() => {
            this.cb(Math.ceil(window.innerHeight - window.visualViewport!.height));
        }, 800);
    }
}

export function InteractiveButtonBox({
    children,
    visualViewportBottomOffset,
    bgColour,
    bgOffset,
}: Readonly<{
    children: React.ReactNode,
    visualViewportBottomOffset: number,
    bgColour: string,
    bgOffset?: string,
}>) {
    return (
        <Box
            position="absolute"
            width="100vw"
            left="0"
            bottom={visualViewportBottomOffset + "px"}
            paddingTop={visualViewportBottomOffset > 0 ? "12.5px" : "0px"}
            paddingBottom={visualViewportBottomOffset > 0 ? "12.5px" : "35px"}
            marginBottom={bgOffset}
            transition=".2s"
            background={bgColour}
        >{children}</Box>
    );
}