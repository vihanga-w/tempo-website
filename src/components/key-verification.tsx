import { HStack } from "@chakra-ui/react";
import { sha256 } from "@daotl/cryptico";
import Jdenticon from "react-jdenticon";

export function VisualKeyVerification({ keyId }: { keyId: string }) {
    return (
        <HStack gap="0" background="rgba(255, 255, 255, 0.05)">
            <Jdenticon size="100%" value={keyId} />
            <Jdenticon size="100%" value={sha256(keyId)} />
        </HStack>
    );
}