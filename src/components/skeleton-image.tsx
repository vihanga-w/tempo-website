import { Image } from "@chakra-ui/react";
import { useState } from "react";
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

export function SkeletonImage({
    src,
    width,
    height,
}: {
    src: string;
    width: string | number;
    height: string | number;
}) {
    const [isLoaded, setIsLoaded] = useState<boolean>(false);

    return (<>
        {!isLoaded && (
            <Skeleton width={width} height={height} />
        )}
        <Image src={src} onLoad={() => {
            setIsLoaded(true);
        }} width={isLoaded ? width : 0} height={isLoaded ? height : 0} />
    </>)
}