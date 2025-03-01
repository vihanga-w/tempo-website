import { Image } from "@chakra-ui/react";
import { useState, useEffect, useRef } from "react";
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
    const [showSkeleton, setShowSkeleton] = useState<boolean>(false);
    const prevSrcRef = useRef<string | undefined>(src);
    const loadedImagesRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (src !== prevSrcRef.current) {
            if (loadedImagesRef.current.has(src ?? "")) {
                setIsLoaded(true);
                setShowSkeleton(false);
            } else {
                setIsLoaded(false);
                setShowSkeleton(false);
                const timer = setTimeout(() => {
                    setShowSkeleton(true);
                }, 500);
                return () => clearTimeout(timer);
            }
            prevSrcRef.current = src;
        }
    }, [src]);

    return (<>
        {showSkeleton && !isLoaded && (
            <Skeleton width={width} height={height} borderRadius={borderRadius} />
        )}
        <Image src={src} opacity={!isLoaded ? 0 : opacity ?? 1} onLoad={() => {
            if (!src)
                return;

            setTimeout(() => {
                setIsLoaded(true);
                loadedImagesRef.current.add(src);
            }, 250);
        }} width={isLoaded ? width : 0} height={isLoaded ? height : 0} borderRadius={borderRadius} />
    </>)
}