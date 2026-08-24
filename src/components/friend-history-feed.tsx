import { VStack, Spinner, Box } from "@chakra-ui/react";
import { useEffect, useState, useRef } from "react";
import { PlaybackHistoryItem } from "@/components/playback-history-item";
import { FriendListenershipItem } from "@/lib/usrlib";

export default function FriendListenershipHistory({
    userId,
    fetchHistory,
    refreshSignal,
}: {
    userId: string;
    fetchHistory: (userId: string, page: number, forceRefresh?: boolean) => Promise<{ data: FriendListenershipItem[]; isFinalPage: boolean }>;
    /**
     * Changes whenever the feed should go back for anything new — a track
     * finishing, the app being returned to, or simply time passing.
     */
    refreshSignal?: string;
}) {
    const [items, setItems] = useState<FriendListenershipItem[]>([]);
    const [currentPage, setCurrentPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [preloadedPage, setPreloadedPage] = useState<FriendListenershipItem[]>([]);
    const [reachedEnd, setReachedEnd] = useState(false);
    const [preloadFinal, setPreloadFinal] = useState(false);

    const loaderRef = useRef<HTMLDivElement>(null);

    // The first signal arrives with the initial load, which has already fetched
    const seenFirstSignal = useRef(false);

    /**
     * Brings in anything played since the feed was opened.
     *
     * Only the newest page is refetched, and only entries newer than the one at
     * the top are kept. Replacing the list outright would throw away every page
     * already scrolled through, and re-adding what is already there would
     * duplicate it — a track that has not moved is the same track.
     */
    useEffect(() => {
        if (!seenFirstSignal.current) {
            seenFirstSignal.current = true;

            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const res = await fetchHistory(userId, 0, true);

                if (cancelled)
                    return;

                setItems(prev => {
                    if (prev.length === 0)
                        return res.data;

                    const newest = prev[0]?.timestamp ?? 0;
                    const fresh = res.data.filter(v => v.timestamp > newest);

                    return (fresh.length > 0 ? [...fresh, ...prev] : prev);
                });
            } catch { }
        })();

        return () => { cancelled = true; };
    }, [refreshSignal, userId]);

    useEffect(() => {
        // Initial page load
        const loadInitial = async () => {
            setLoading(true);

            try {
                const res = await fetchHistory(userId, 0);

                setItems(res.data);
                setReachedEnd(res.isFinalPage);
                setLoading(false);

                if (!res.isFinalPage) {
                    preloadPage(1);
                }
            } catch { }
        };

        loadInitial();
    }, [userId]);

    const preloadPage = async (page: number) => {
        try {
            const res = await fetchHistory(userId, page);

            setPreloadedPage(res.data);

            /*
             * Remembered, not acted on. Marking the end here is what made the
             * last page of somebody's history unreachable: the rows were held in
             * preloadedPage waiting to be appended, but reachedEnd unmounted the
             * sentinel that does the appending, so they were fetched and thrown
             * away. The end is reached once these rows are on screen, not once
             * they have arrived.
             */
            setPreloadFinal(res.isFinalPage);

            // Unless there are none — nothing is coming to append, so there is
            // nothing left to notice the end.
            if (res.isFinalPage && res.data.length === 0)
                setReachedEnd(true);
        } catch { }
    };

    const loadNextPage = () => {
        if (loading || preloadedPage.length === 0) return;

        setItems(prev => [...prev, ...preloadedPage]);
        setCurrentPage(prev => prev + 1);
        setPreloadedPage([]);

        if (preloadFinal) {
            setReachedEnd(true);
            return;
        }

        preloadPage(currentPage + 2); // preload the page after the new one
    };

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !loading && !reachedEnd) {
                loadNextPage();
            }
        }, {
            rootMargin: "100px",
        });

        if (loaderRef.current) {
            observer.observe(loaderRef.current);
        }

        // Unconditionally: the sentinel is unmounted the moment the last page
        // lands, so by the time this runs loaderRef is often already null — and
        // guarding on it left an observer attached for the life of the page.
        return () => observer.disconnect();
    }, [loading, preloadedPage, preloadFinal, reachedEnd]);

    return (
        // The key belongs on the outer element of each entry. It used to sit on
        // an inner Divider inside an unkeyed fragment, so React had nothing to
        // identify a row by and rebuilt the whole feed on every page appended.
        <VStack spacing={0} align="stretch" w="100%">
            {items.map((item, idx) => (
                <Box
                    key={item.item.track.id + ":" + item.timestamp}
                    paddingY="10px"
                    borderTop={idx > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined}
                >
                    <PlaybackHistoryItem data={item} />
                </Box>
            ))}
            {!reachedEnd && (
                <Box ref={loaderRef} display="flex" justifyContent="center" alignItems="center" py={6}>
                    <Spinner size="md" />
                </Box>
            )}
        </VStack>
    );
}