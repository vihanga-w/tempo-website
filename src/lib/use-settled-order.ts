import { useEffect, useRef, useState } from "react";

import { REORDER_FLOOR_MS, settleOrder } from "./settled-order";

/**
 * The order to render, held back so it cannot rearrange itself faster than the
 * floor allows.
 *
 * The decision is in settleOrder and tested there; this is the timer around it.
 * When a reshuffle is held, one timeout is set for the moment it becomes
 * allowed - without which a held order would sit there until some unrelated
 * update happened to wake the component.
 *
 * @param desired the order that would be shown if nothing were held back.
 */
export function useSettledOrder(desired: string[], quietMs: number = REORDER_FLOOR_MS): string[] {
    const [order, setOrder] = useState<string[]>(desired);

    const lastMovedAt = useRef<number>(0);
    const orderRef = useRef<string[]>(order);

    orderRef.current = order;

    // The array is a new object every render; its contents are what this
    // actually depends on
    const key = desired.join(" ");

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;

        const apply = () => {
            const now = Date.now();
            const decision = settleOrder(orderRef.current, desired, lastMovedAt.current, now, quietMs);

            if (decision.retryIn !== null) {
                timer = setTimeout(apply, decision.retryIn);

                return;
            }

            // Stamped only when something actually moved, so a run of identical
            // orders cannot keep pushing the next rearrangement further away
            if (decision.order.join(" ") !== orderRef.current.join(" ")) {
                lastMovedAt.current = now;

                setOrder(decision.order);
            }
        };

        apply();

        return () => { if (timer !== undefined) clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, quietMs]);

    return order;
}
