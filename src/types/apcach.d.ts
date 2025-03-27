declare module "apcach" {
    /**
     * Converts a color to a background color based on contrast requirements.
     * @param color - The input color in a supported format (e.g., hex, rgb).
     * @param contrast - The desired contrast ratio.
     * @returns The adjusted background color.
     */
    export function crToBg(color: string, contrast: number): string;

    /**
     * The structure of the output object returned by the `apcach` function.
     */
    export interface ApcachOutput {
        alpha: number;
        chroma: number;
        colorSpace: string;
        contrastConfig: {
            bgColor: string;
            contrastModel: string;
            cr: number;
            fgColor: string;
            searchDirection: string;
        };
        hue: number;
        lightness: number;
    }

    /**
     * Adjusts a color using the APCA (Advanced Perceptual Contrast Algorithm).
     * @param color - The input color in a supported format (e.g., oklch).
     * @param chroma - The chroma value to adjust.
     * @param hue - The hue value to adjust.
     * @returns The adjusted color object.
     */
    export function apcach(color: string, chroma: number, hue: number): ApcachOutput;
}
