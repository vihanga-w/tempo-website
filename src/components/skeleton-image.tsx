import { Image } from "@chakra-ui/react";
import { useState, useEffect } from "react";
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

export function SkeletonImage({
    src,
    width,
    height,
    opacity,
    borderRadius,
}: {
    src?: string;
    width?: string | number;
    height?: string | number;
    opacity?: string | number;
    borderRadius?: string | number;
}) {
    const [isLoaded, setIsLoaded] = useState<boolean>(false);
    const [prevSrc, setPrevSrc] = useState<string | undefined>(src);

    useEffect(() => {
        if (src !== prevSrc) {
            setIsLoaded(false);
            setPrevSrc(src);
        }
    }, [src, prevSrc]);

    return (<>
        {!isLoaded && (
            <Skeleton width={width} height={height} borderRadius={borderRadius} />
        )}
        <Image src={src} opacity={!isLoaded ? 0 : opacity ?? 1} onLoad={() => {
            if (!src)
                return;

            setTimeout(() => {
                setIsLoaded(true);
            }, 100);
        }} width={isLoaded ? width : 0} height={isLoaded ? height : 0} borderRadius={borderRadius} />
    </>)
}