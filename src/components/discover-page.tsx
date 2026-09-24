import { memo, useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from "react";
import { Box, Center, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import {
    animate, motion, motionValue, useMotionValue, useTransform,
    type AnimationPlaybackControls, type MotionValue, type PanInfo,
} from "framer-motion";
import { Heart, Pause, Play, Sparkles, Users, X } from "lucide-react";
import { MdExplicit } from "react-icons/md";
import confetti from "canvas-confetti";

import type User from "@/lib/usrlib";
import type { FeedItem } from "@/lib/usrlib";
import { API_URL } from "@/lib/const";
import { getSizedImageUrl } from "@/lib/sized-img";
import {
    chipFill, extractArtworkColour, extractArtworkPalette, FALLBACK_ACCENT, PAGE_BG,
    readableAccent, rgbToHex, type Rgb,
} from "@/lib/artwork-colour";
import { glassSurface, GLASS_TRANSITION } from "@/lib/liquid-glass";
import {
    appendPage, isLastPage, playNote, sinceShort,
    type DiscoverCard, type DiscoverFriend,
} from "@/lib/discover-feed";
import { readCoverTones, type CoverTones } from "@/lib/cover-tone";
import { hashKey, preferencesStore, readCursor, searchPage, writeCursor, type CursorSearch } from "@/lib/discover-cursor";
import { decideSwipe, ratingStrength } from "@/lib/swipe";
import { feelPattern } from "@/lib/native-haptics";
import { useCalm } from "@/lib/use-calm";
import { ArtworkWash } from "./artwork-wash";
import { SkeletonImage } from "./playback-state";
import { songLink } from "../lib/music-links";
import { InitialAvatar } from "./initial-avatar";

/**
 * Discover: one song at a time, and why it is here.
 *
 * This is Discover and For You made one page. For You was mostly friends'
 * plays, shown a page of live listening at a time — which the Friends page
 * already does, better — and Discover was picks on a flat block of the cover's
 * average colour. What each was for survives: songs you have not heard, from
 * what you play and from what your friends play, each saying which it is.
 *
 * The colour is the profile page's, for the profile page's reasons (see
 * lib/artwork-colour.ts). The cover lights the page from above as a wash,
 * rather than the page being painted in its average — the average of a cover
 * is mud, and a whole screen of any one colour reads far more saturated than
 * the same colour on a sleeve. The wash is kept to half strength, the accent
 * (readableAccent) goes only on small things — the chip, a link, the title bar —
 * and text only ever sits on colours it was checked against.
 *
 * The cover is the player. Tapping it plays the preview, its progress runs along
 * the sleeve's foot, and the one piece of glass on the card is the play button
 * sitting on the artwork — glass over media, which is what the material is for.
 *
 * What makes it smooth, which took a rewrite:
 *
 *   - Nothing about a gesture goes through React. The finger writes to motion
 *     values, which write to the DOM; the first version put the drag in state,
 *     so every pointer move re-rendered the page — wash, cards and all — and
 *     the drag stuttered for the length of it.
 *   - Each card owns its horizontal value. A card thrown away keeps its own
 *     position for good, so there is no moment where a card that has been
 *     dealt with reads as being back in the middle.
 *   - A rating is a toss, not a page turn. The card is thrown where it stands
 *     and the next grows into its place from underneath; the stack itself does
 *     not move, and the feed moves on only once the card has left the screen.
 *   - One release decides once, the stack's offset is absolute rather than
 *     added to, and it is jumped rather than set — a set would report the jump
 *     as speed and the spring would sail a screen past before returning.
 *   - The progress line is a motion value too, or the card would re-render four
 *     times a second for the whole of a preview.
 *   - While a finger is down the wash stops drifting and the glass stops
 *     blurring, set by an attribute on the page rather than by a render. A
 *     backdrop filter over a moving card is re-blurred every frame.
 *   - On a device that is behind — Low Power Mode caps iOS at 30fps — the page
 *     runs calm: see lib/use-calm.ts and the wash's quiet detail.
 */

const INK = "#f6f5f8";
const INK_DIM = "#9d9aa6";
const INK_FAINT = "#65626e";
const SURFACE_HI = "#1c1b20";
/** The glyph on light glass: near-black, as the profile's rank badge sets its figure. */
const ON_LIGHT = "#121215";

const SLEEVE_RADIUS = "12px";
/** The sleeve takes what the text leaves it, up to half the screen's height. */
const SLEEVE_MAX = "min(100%, 50vh)";

/** The space the shell's title takes above a page. */
const TOP_CLEAR = "calc(var(--safe-area-inset-top, 0px) + 60px)";
/** Clear of the menu button: its inset, its size, and a gap. */
const BOTTOM_CLEAR = "calc(var(--safe-area-inset-bottom, 0px) + 22px + 52px + 22px)";

/**
 * How much runway to keep, in cards.
 *
 * A page is asked for once there are fewer than LOAD_WHEN_AHEAD_UNDER ahead,
 * and pages keep coming until there are KEEP_AHEAD: neither the fetch nor the
 * render that follows it should ever land in the middle of a swipe. One page is
 * twenty items, so usually one fetch covers it.
 */
const LOAD_WHEN_AHEAD_UNDER = 8;
const KEEP_AHEAD = 12;
/** How many pages one round may fetch, so a reshuffling server cannot hold the loop. */
const PAGES_PER_LOAD = 3;

/**
 * How many cards ahead are made ready: colour read, cover decoded, preview
 * found. Three is about as far ahead as a fast scroll gets before the next
 * quiet moment.
 */
const WARM_AHEAD = 3;

/** How long work put off by a gesture waits, so the settle has the frames to itself. */
const AFTER_GESTURE_MS = 220;

/**
 * How long a rating is held before it is sent.
 *
 * Rating a song teaches the recommender, and until now a mis-swipe taught it
 * something wrong for good: sending the opposite afterwards does not undo it,
 * since both ratings stay in the history for months. Held for a few seconds,
 * coming back to the card cancels the rating outright rather than arguing with
 * it. Leaving the page is not undoing, so anything still held is sent then.
 */
const RATING_GRACE_MS = 5000;

/** The spring a cancelled card comes back on: loose, so it visibly rebounds. */
const UNDONE = { type: "spring", stiffness: 300, damping: 12 } as const;

/** How far off screen a rated card is thrown, as a share of the width. */
const THROW_OUT = 1.25;

const PREVIEW_FADE_S = 3;

/**
 * How long one card's wash takes to hand over to the next.
 *
 * Shorter than it was: for the whole hand-over there are two blurred washes on
 * screen, and that window is the most expensive moment on the page. Shorter
 * still when the device is behind, where it is barely a cross-fade at all.
 */
const WASH_FADE_S = 0.45;
const WASH_FADE_CALM_S = 0.18;
/** The wash's strength, as the profile page lays it. */
const WASH_OPACITY = 0.5;

/** How a card settles when it is let go, and the cheap version for a device that is behind. */
const SETTLE = { type: "spring", stiffness: 420, damping: 40, mass: 0.9 } as const;
const SETTLE_CALM = { duration: 0.16, ease: "easeOut" } as const;
const THROW = { type: "spring", stiffness: 300, damping: 30 } as const;
const THROW_CALM = { duration: 0.18, ease: "easeOut" } as const;

/** How long the page keeps its blur and drift switched off after a gesture. */
const CALM_AFTER_GESTURE_MS = 260;

/**
 * How far the card underneath has come forward, for what is drawn inside it.
 *
 * The layer that moves a card has to stay transforms-only — an opacity there
 * makes it a backdrop root and the glass on the sleeve stops blurring — so the
 * parts of a card that fade do it themselves, from this. It is 1 for any card
 * that is simply where it belongs.
 */
const Reveal = createContext<MotionValue<number>>(motionValue(1));

type Rating = "liked" | "passed";

type Colour = { accent: Rgb | null; palette: string[]; tones: CoverTones | null };

/** Colours read off a cover, kept for the session: going back a card should not read it again. */
const colourCache = new Map<string, Promise<Colour>>();

function readColour(src: string): Promise<Colour> {
    let cached = colourCache.get(src);

    if (!cached) {
        cached = Promise.all([extractArtworkColour(src), extractArtworkPalette(src), readCoverTones(src)])
            .then(([accent, palette, tones]) => ({ accent, palette, tones }))
            .catch(() => ({ accent: null, palette: [], tones: null }));

        colourCache.set(src, cached);
    }

    return cached;
}

/** The status bar is the top of the page, so it takes the accent halfway into the page. */
function setStatusBarColour(colour: string) {
    document.querySelector("meta[name=theme-color]")?.setAttribute("content", colour);
}

/** The server's likeness, as somebody would say it. */
function matchLabel(match: number) {
    return `${Math.round(match * 100)}% match`;
}

export default function DiscoverPage({
    user,
    onPaletteChange,
    setComplementaryColour,
    openProfile,
    fetchPage,
    forceCalm,
}: Readonly<{
    user: User;
    /** The colours the floating controls glow with, while a preview is playing. */
    onPaletteChange?: (colours: string[] | null) => void;
    /** The shell's title colour. */
    setComplementaryColour?: (colour: string) => void;
    openProfile?: (userId: string) => void;
    /** Where pages come from. The bench passes its own; the app asks the server for the mixed feed. */
    fetchPage?: (page: number) => Promise<FeedItem[]>;
    /**
     * Run calm whatever the device is doing. For the bench only: Low Power Mode
     * cannot be switched on in a simulator, and this is the path it takes.
     */
    forceCalm?: boolean;
}>) {
    const measured = useCalm();
    const calm = (forceCalm || measured);

    const [cards, setCards] = useState<DiscoverCard[]>([]);
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [ended, setEnded] = useState(false);
    const [loadedOnce, setLoadedOnce] = useState(false);
    /** Whether the feed was cut at the mark: what came before it had been dealt already. */
    const [seenBefore, setSeenBefore] = useState(false);
    const [ratings, setRatings] = useState<Record<string, Rating>>({});

    const nextPage = useRef(1);
    const loadingRef = useRef(false);
    /** What has been shown, for the loader: it runs across awaits, and state would be stale by then. */
    const cardsRef = useRef<DiscoverCard[]>([]);
    /** Where the reader is, for the same reason. */
    const indexRef = useRef(0);
    /**
     * Whether anything is moving: a finger, a throw, or a card settling.
     *
     * A ref, because everything that reads it is avoiding a render. Work that
     * can wait — fetching a page, reading a cover — waits for this to clear.
     */
    const moving = useRef(false);
    /** Bumped when the page comes to rest, to let the waiting work run. */
    const [settleTick, setSettleTick] = useState(0);
    /** Covers already handed to the decoder. */
    const decoded = useRef(new Set<string>());
    /**
     * Where the last fetch got to, kept on the device: see lib/discover-cursor.ts.
     * For the real feed only. The bench deals its own pages, and should deal
     * them every time.
     */
    const store = (fetchPage ? null : preferencesStore);
    /** The mark being looked for, with the pages held back until it is found. Null once it has been dealt with. */
    const seeking = useRef<CursorSearch | null>(null);
    /** The furthest card the reader has got past this visit: the mark is written as they go. */
    const furthest = useRef(0);
    /** Whether the mark has been read from the device yet, which happens once, on the first load. */
    const soughtMark = useRef(false);

    const load = useCallback(async () => {
        if (loadingRef.current)
            return;

        loadingRef.current = true;
        setLoading(true);

        const get = fetchPage ?? ((page: number) => user.getMyFYP(page));

        try {
            if (store && !soughtMark.current) {
                soughtMark.current = true;

                const hash = await readCursor(store);

                if (hash)
                    seeking.current = { hash, held: [], pages: 0 };
            }

            /*
             * Keep fetching until there is runway.
             *
             * A page can also come back holding only songs already shown, since
             * the server reshuffles its pool every quarter of an hour, so
             * "added nothing" is not the end either — but the loop is bounded,
             * or a busy reshuffle could hold it all day.
             */
            for (let round = 0; round < PAGES_PER_LOAD; round++) {
                const page = (await get(nextPage.current)) ?? [];

                nextPage.current += 1;

                /*
                 * Cut the page at the mark left last time. A page that ends
                 * with it has all been seen; one without it is held back while
                 * the next pages are looked through, and shown from the start
                 * only once the search has given up — the mark not being
                 * anywhere means the order has changed, not that it was all seen.
                 */
                let items = page;

                if (seeking.current) {
                    const step = searchPage(seeking.current, page);

                    if (step.kind === "hold") {
                        seeking.current = step.search;
                        // A page held back is not a round: the search has its own bound
                        round--;

                        continue;
                    }

                    seeking.current = null;
                    items = step.items;

                    if (step.kind === "found")
                        setSeenBefore(true);
                }

                const next = appendPage(cardsRef.current, items);

                cardsRef.current = next;
                setCards(next);

                if (isLastPage(page)) {
                    setEnded(true);

                    break;
                }

                if (next.length - indexRef.current >= KEEP_AHEAD)
                    break;
            }
        } catch (ex) {
            console.error("Failed to load Discover, error:", ex);
        } finally {
            loadingRef.current = false;
            setLoading(false);
            setLoadedOnce(true);
        }
    }, [fetchPage, store, user]);

    useEffect(() => {
        load();
    }, [load]);

    /** Deal the feed again from its first page, mark or no mark. */
    const dealAgain = useCallback(() => {
        nextPage.current = 1;
        seeking.current = null;
        furthest.current = 0;
        cardsRef.current = [];
        setCards([]);
        setIndex(0);
        setEnded(false);
        setSeenBefore(false);
        setLoadedOnce(false);
        load();
    }, [load]);

    useEffect(() => {
        indexRef.current = index;
    }, [index]);

    // Never while anything is moving: the settle after a swipe gets the frames,
    // and the tick from coming to rest brings this straight back
    /*
     * The mark is where the reader has got to, written as they pass each
     * card. It was once written by the fetch, as the last song of the last
     * page fetched — but a page is fetched while the reader is still eight
     * cards short of the one before it, so a mark left that way skipped up
     * to a page of cards they had never seen. Only ever moved forward: a
     * reader who goes back over cards has still dealt with them.
     */
    useEffect(() => {
        if (!store || index <= furthest.current)
            return;

        furthest.current = index;

        const passed = cards[index - 1];

        if (passed?.kind === "song")
            writeCursor(hashKey(passed.key), store);
    }, [cards, index, store]);

    useEffect(() => {
        if (!ended && loadedOnce && !moving.current && cards.length - index < LOAD_WHEN_AHEAD_UNDER)
            load();
    }, [index, cards.length, ended, loadedOnce, load, settleTick]);

    const current = cards[index] ?? null;
    const atEnd = loadedOnce && index >= cards.length;

    /* ---------------------------------------------------------------- colour */

    const page = useRef<HTMLDivElement>(null);
    const easeOff = useRef<ReturnType<typeof setTimeout> | null>(null);

    /**
     * Hold the expensive things still while the page is being moved.
     *
     * An attribute, not state: this happens on pointer down, and a render
     * there is the thing being avoided. The rules are in the page's own sx.
     */
    const holdStill = useCallback((down: boolean) => {
        if (easeOff.current)
            clearTimeout(easeOff.current);

        if (down) {
            moving.current = true;

            if (page.current)
                page.current.dataset.moving = "true";

            return;
        }

        easeOff.current = setTimeout(() => {
            moving.current = false;

            if (page.current)
                delete page.current.dataset.moving;

            // Whatever was waiting for the page to be still can go now
            setSettleTick(tick => tick + 1);
        }, CALM_AFTER_GESTURE_MS);
    }, []);

    const washFade = (calm ? WASH_FADE_CALM_S : WASH_FADE_S);

    const [colour, setColour] = useState<{ art: string | null } & Colour>({ art: null, accent: null, palette: [], tones: null });
    /** How each cover reads under the controls, for every card that has been read: the next one slides in already right. */
    const [coverTones, setCoverTones] = useState<Record<string, CoverTones>>({});

    const rememberTones = (art: string, read: Colour) => {
        const tones = read.tones;

        if (tones)
            setCoverTones(known => (known[art] ? known : { ...known, [art]: tones }));
    };

    /**
     * The washes on screen: the one for this card, and any still fading out.
     *
     * Cross-faded, both at once. The first version faded the new wash in over
     * the old one and dropped the old one afterwards, and two half-transparent
     * washes stacked read brighter than either — so every card change flared
     * the top of the page and then snapped back down when the old one went.
     * Keyed by cover, so a wash keeps its element, and its drift, as it leaves.
     */
    const [washes, setWashes] = useState<{ art: string; palette: string[]; leaving: boolean }[]>([]);

    const artOf = useCallback((card: DiscoverCard | null | undefined) =>
        (card?.kind === "song" && card.song.imageUrl ? getSizedImageUrl(card.song.imageUrl, 300, 300) : null), []);

    /** The sleeve at the size a card shows it, which is not the size its colour is read from. */
    const sleeveOf = useCallback((card: DiscoverCard | null | undefined) =>
        (card?.kind === "song" && card.song.imageUrl ? getSizedImageUrl(card.song.imageUrl, 640, 640) : null), []);

    const currentArt = artOf(current);

    useEffect(() => {
        let cancelled = false;

        if (!currentArt) {
            setColour({ art: null, accent: null, palette: [], tones: null });

            return;
        }

        readColour(currentArt).then(read => {
            rememberTones(currentArt, read);

            if (!cancelled)
                setColour(previous => (previous.art === currentArt ? previous : { art: currentArt, ...read }));
        });

        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentArt]);

    useEffect(() => {
        // The cross-fade is two blurred layers at once, so it counts as movement
        holdStill(true);
        holdStill(false);

        setWashes(shown => {
            const next = shown.map(wash => ({ ...wash, leaving: wash.art !== colour.art }));

            if (colour.art && !next.some(wash => wash.art === colour.art))
                next.push({ art: colour.art, palette: colour.palette, leaving: false });

            return next;
        });

        const timer = setTimeout(() => setWashes(shown => shown.filter(wash => !wash.leaving)), washFade * 1000 + 50);

        return () => clearTimeout(timer);
    // The palette travels with the cover it was read off
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [colour.art]);

    const milestone = current?.kind === "milestone";
    const tint = colour.accent;
    const accentInk = useMemo(
        () => (tint ? readableAccent(tint) : FALLBACK_ACCENT),
        [tint],
    );

    useEffect(() => {
        setStatusBarColour(tint
            ? rgbToHex({ r: 0.5 * tint.r + 6.5, g: 0.5 * tint.g + 6.5, b: 0.5 * tint.b + 7 })
            : PAGE_BG);

        setComplementaryColour?.(accentInk);
    }, [tint, accentInk, setComplementaryColour]);

    useEffect(() => () => setStatusBarColour(PAGE_BG), []);

    /* ----------------------------------------------------------------- audio */

    const audio = useRef<HTMLAudioElement | null>(null);
    const previews = useRef(new Map<string, string | null>());
    /** Previews being looked for, so the same song is not asked about twice. */
    const asking = useRef(new Set<string>());
    const [playing, setPlaying] = useState(false);
    /** Whether this card's preview has been started, which is when the line appears. */
    const [started, setStarted] = useState(false);
    /** How far through the preview, 0 to 1. A value, not state: it moves four times a second. */
    const progress = useMotionValue(0);
    const [preview, setPreview] = useState<{ songId: string; url: string | null } | null>(null);
    /** Once somebody has pressed play, moving on keeps playing — until they pause. */
    const wantsSound = useRef(false);

    const stop = useCallback(() => {
        const el = audio.current;

        if (el) {
            el.pause();
            el.removeAttribute("src");
            el.load();
        }

        setPlaying(false);
        setStarted(false);
        progress.set(0);
    }, [progress]);

    const start = useCallback(async (url: string) => {
        // Made on the first press, which is the gesture iOS needs to allow sound
        if (!audio.current) {
            const el = new Audio();

            el.preload = "auto";
            el.addEventListener("timeupdate", () => {
                const remaining = el.duration - el.currentTime;

                // Faded out over the last seconds, so a preview ends rather than stops
                el.volume = (Number.isFinite(remaining) && remaining < PREVIEW_FADE_S)
                    ? Math.max(0, remaining / PREVIEW_FADE_S)
                    : 1;

                progress.set(el.currentTime / (Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 30));
            });
            el.addEventListener("ended", () => {
                setPlaying(false);
                progress.set(0);
            });
            el.addEventListener("pause", () => setPlaying(false));
            el.addEventListener("play", () => {
                setPlaying(true);
                setStarted(true);
            });

            audio.current = el;
        }

        const el = audio.current;

        if (el.src !== url)
            el.src = url;

        try {
            await el.play();
        } catch (ex) {
            console.warn("Could not play the preview:", ex);
            setPlaying(false);
        }
    }, [progress]);

    const currentSongId = current?.kind === "song" ? current.song.id : null;

    useEffect(() => {
        stop();
        setPreview(null);

        if (!current || current.kind !== "song")
            return;

        const { id, previewUrl } = current.song;
        let cancelled = false;
        let startAfter: ReturnType<typeof setTimeout> | null = null;

        const resolved = (url: string | null) => {
            if (cancelled)
                return;

            previews.current.set(id, url);
            setPreview({ songId: id, url });

            /*
             * Carrying on playing waits for the card to have arrived. Opening a
             * stream takes a frame or two, and during the settle those are the
             * frames somebody is watching.
             */
            if (url && wantsSound.current)
                startAfter = setTimeout(() => start(url), AFTER_GESTURE_MS);
        };

        if (previewUrl) {
            resolved(previewUrl);
        } else if (previews.current.has(id)) {
            resolved(previews.current.get(id) ?? null);
        } else {
            fetch(API_URL + `/audio/preview/${id}`, { headers: { ...user.getAuthHeaders() }, credentials: "include" })
                .then(res => (res.status === 200 ? res.text() : null))
                .then(url => resolved(url && url.startsWith("http") ? url : null))
                .catch(() => resolved(null));
        }

        return () => {
            cancelled = true;

            if (startAfter)
                clearTimeout(startAfter);
        };
    // The song, not the card object: a new page re-creates every card
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentSongId]);

    useEffect(() => () => {
        audio.current?.pause();
        audio.current = null;
    }, []);

    /** Finds a song's preview and keeps the URL, without going near the player. */
    const warmPreview = useCallback((songId: string, url?: string) => {
        if (url) {
            previews.current.set(songId, url);

            return;
        }

        if (previews.current.has(songId) || asking.current.has(songId))
            return;

        asking.current.add(songId);

        fetch(API_URL + `/audio/preview/${songId}`, { headers: { ...user.getAuthHeaders() }, credentials: "include" })
            .then(async res => {
                /*
                 * A refusal that might not last is not an answer, and must not
                 * be remembered as one: null here means "this song has no
                 * preview", and the lookup for the card in front skips anything
                 * already remembered. So a rate limit or a bad minute from the
                 * service took the preview off that song for the rest of the
                 * sitting, however quickly it came back. Undefined leaves the
                 * question open, and the card asks again when it arrives.
                 */
                if (res.status === 429 || res.status >= 500)
                    return undefined;

                const found = (res.status === 200 ? await res.text() : null);

                return (found && found.startsWith("http") ? found : null);
            })
            .then(found => {
                if (found !== undefined)
                    previews.current.set(songId, found);
            })
            .catch(() => { /* The card asks again when it arrives. */ })
            .finally(() => asking.current.delete(songId));
    }, [user]);

    /**
     * Everything the cards ahead will need, done while nothing is moving.
     *
     * This is the answer to a swipe that stutters: by the time a card arrives
     * its cover is decoded, its colours are read and its preview is found, so
     * the change itself is a transform and nothing else. Held back while a
     * finger is down, and brought back by the tick when the page rests.
     */
    useEffect(() => {
        if (moving.current)
            return;

        let cancelled = false;

        const warm = () => {
            if (cancelled)
                return;

            for (let ahead = 1; ahead <= WARM_AHEAD; ahead++) {
                const card = cards[index + ahead];

                if (!card || card.kind !== "song")
                    continue;

                const art = artOf(card);

                if (art)
                    readColour(art).then(read => rememberTones(art, read));

                const sleeve = sleeveOf(card);

                if (sleeve && !decoded.current.has(sleeve)) {
                    decoded.current.add(sleeve);

                    const image = new Image();

                    image.src = sleeve;
                    image.decode?.().catch(() => { /* The loader will show what it can. */ });
                }

                warmPreview(card.song.id, card.song.previewUrl);
            }
        };

        // Idle time if the browser offers it, and a short wait if it does not
        const idle = window.requestIdleCallback?.(warm, { timeout: 500 });
        const timer = (idle === undefined ? setTimeout(warm, 120) : null);

        return () => {
            cancelled = true;

            if (timer)
                clearTimeout(timer);

            if (idle !== undefined)
                window.cancelIdleCallback?.(idle);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cards, index, settleTick, artOf, sleeveOf, warmPreview]);

    const togglePlay = useCallback(() => {
        const url = preview?.url;

        if (!url)
            return;

        if (playing) {
            wantsSound.current = false;
            audio.current?.pause();
        } else {
            wantsSound.current = true;
            start(url);
        }
    }, [playing, preview, start]);

    // The floating controls catch the page's colour while something is playing, as on a profile
    useEffect(() => {
        if (!onPaletteChange)
            return;

        onPaletteChange(playing && tint ? [accentInk, rgbToHex(tint)] : null);
    }, [onPaletteChange, playing, tint, accentInk]);

    useEffect(() => () => onPaletteChange?.(null), [onPaletteChange]);

    /* ----------------------------------------------------------- navigation */

    /**
     * Where the stack sits vertically while a finger is on it, and where each
     * card sits sideways.
     *
     * Values rather than state: they are written on every pointer move, and
     * a motion value reaches the DOM without a React render.
     *
     * Sideways is per card, kept in a ref rather than made by a hook, because
     * how many cards there are is not fixed. It is also what makes a thrown
     * card stay thrown: the card keeps its own value at the position it left
     * for, so nothing has to be reset at the moment the feed moves on.
     */
    const panY = useMotionValue(0);
    const xs = useRef(new Map<string, MotionValue<number>>());

    const xFor = useCallback((key: string) => {
        let value = xs.current.get(key);

        if (!value) {
            value = motionValue(0);
            xs.current.set(key, value);
        }

        return value;
    }, []);

    const [thrown, setThrown] = useState<Record<string, 1 | -1>>({});
    const axis = useRef<"x" | "y" | null>(null);
    /** A pan ends in a pointerup, which is a click too; this keeps one from being both. */
    const panned = useRef(false);
    /**
     * One release, one decision.
     *
     * A release could be seen twice — a pointerup and whatever follows it — and
     * the second one moved the feed on again: the stack was sent two screens
     * for a single swipe, so two cards flew past while the index moved by one.
     */
    const released = useRef(false);
    /** Where the finger had got to vertically, so a repeated release cannot add twice. */
    const dragged = useRef(0);
    /** Cards on their way out, so one cannot be rated twice while it leaves. */
    const flying = useRef(new Set<string>());
    /** Their throws, so an undo can stop one in mid-air. */
    const flights = useRef(new Map<string, AnimationPlaybackControls>());
    /** Ratings waiting out their grace period, by card. */
    const held = useRef(new Map<string, {
        songId: string;
        affinity: number;
        previous?: Rating;
        timer: ReturnType<typeof setTimeout>;
    }>());

    const [size, setSize] = useState(() => ({
        width: (typeof window === "undefined" ? 390 : window.innerWidth),
        height: (typeof window === "undefined" ? 800 : window.innerHeight),
    }));

    useEffect(() => {
        const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });

        window.addEventListener("resize", onResize);

        return () => window.removeEventListener("resize", onResize);
    }, []);

    const settle = useCallback((value: MotionValue<number>, to = 0) =>
        animate(value, to, calm ? SETTLE_CALM : SETTLE), [calm]);

    const go = useCallback((step: 1 | -1) => {
        // Not while a tossed card is still on its way out: the feed moves on by
        // itself once it has gone, and moving it now as well would skip a card
        const here = cards[index];

        if (here && flying.current.has(here.key))
            return;

        const next = Math.max(0, Math.min(index + step, cards.length));

        if (next === index)
            return;

        /*
         * The card arriving is placed where it already was — a screen below or
         * above — and the whole stack slides from there, so the change is one
         * movement.
         *
         * Jumped, not set, and settled from a standstill. A set records the
         * distance as speed: a whole screen inside one frame, which is tens of
         * thousands of pixels a second, and the spring then carried on in that
         * direction before turning round. The stack overshot by a screen and a
         * half, and those cards flying past were the second swipe nobody asked
         * for. jump() moves the value without claiming it travelled.
         *
         * Absolute, too, off the offset the finger left: a release seen twice
         * then lands on the same place rather than adding another screen.
         */
        panY.jump(dragged.current + (next - index) * size.height);
        animate(panY, 0, {
            ...(calm ? SETTLE_CALM : SETTLE),
            velocity: 0,
            onComplete: () => { dragged.current = 0; },
        });
        setIndex(next);
    }, [calm, cards, index, panY, size.height]);

    /**
     * Which rating sent for a card is the newest.
     *
     * A reader can come back to a card and rate it again while the first
     * request is still in the air. Without this, that first one failing put its
     * own idea of the card back - clearing the choice they had just made, or
     * showing them the opposite of it.
     */
    const sent = useRef(new Map<string, number>());

    /** Sends a rating that was not taken back, and puts the card as it was if the server refuses. */
    const send = useCallback((key: string, songId: string, affinity: number, previous?: Rating) => {
        held.current.delete(key);

        const attempt = (sent.current.get(key) ?? 0) + 1;

        sent.current.set(key, attempt);

        // Taste picks are ranked away from anything rated down, and towards what is rated up
        user.setSongAffinity(songId, affinity)
            .then(ok => {
                if (!ok)
                    throw new Error("refused");
            })
            .catch(ex => {
                console.warn("Could not save a rating:", ex);

                // Only the newest send may undo itself; anything older has
                // already been overtaken by a choice the reader can see.
                if (sent.current.get(key) !== attempt)
                    return;

                setRatings(r => {
                    const next = { ...r };

                    if (previous)
                        next[key] = previous;
                    else
                        delete next[key];

                    return next;
                });
            });
    }, [user]);

    const rate = useCallback((card: DiscoverCard, rating: Rating, strength = 3) => {
        if (card.kind !== "song" || flying.current.has(card.key) || held.current.has(card.key))
            return;

        const previous = ratings[card.key];
        const dir: 1 | -1 = (rating === "liked" ? 1 : -1);
        const from = cards.indexOf(card);

        // A like rises and a pass falls, so a pocket can tell them apart
        feelPattern(rating === "liked" ? "reward" : "refuse");

        flying.current.add(card.key);
        setRatings(r => ({ ...r, [card.key]: rating }));

        /*
         * Tossed where it stands, while the next card grows into its place from
         * underneath — and only once it has left the screen does the feed move
         * on, at a moment when nothing visible changes.
         *
         * Twice this went wrong. First the feed waited for the throw's spring to
         * be declared finished, long after the card was out of sight, and then
         * slid the next card up by itself: a rating read as two swipes. Then it
         * moved on at the release instead, which moved the whole stack up a
         * screen while the card was still flying — the toss was carried off the
         * top, and all that was left to see was a page sliding over. A rating
         * is not a page turn, so the stack does not move for one at all.
         */
        const x = xFor(card.key);
        let moved = false;
        let stopWatching = () => { /* Replaced below, before anything can call it. */ };

        const moveOn = () => {
            if (moved)
                return;

            moved = true;
            stopWatching();

            // Only from where it was rated; anywhere else, the reader has moved on themselves
            setIndex(i => (i === from ? from + 1 : i));
        };

        // Clear of the screen, not merely finished: a spring is declared over
        // long after it stops being visible
        stopWatching = x.on("change", value => {
            if (Math.abs(value) >= size.width)
                moveOn();
        });

        flights.current.set(card.key, animate(x, dir * size.width * THROW_OUT, {
            ...(calm ? THROW_CALM : THROW),
            // Parked only once it is out there; parked at the start it would
            // jump to the position instead of flying to it
            onComplete: () => {
                flying.current.delete(card.key);
                flights.current.delete(card.key);
                moveOn();
                setThrown(t => ({ ...t, [card.key]: dir }));
            },
        }));

        const affinity = dir * strength;

        held.current.set(card.key, {
            songId: card.song.id,
            affinity,
            previous,
            timer: setTimeout(() => send(card.key, card.song.id, affinity, previous), RATING_GRACE_MS),
        });
    }, [calm, cards, ratings, send, size.width, xFor]);

    const onPanStart = useCallback(() => {
        // A card still being tossed away finishes going first; this gesture is ignored
        const here = cards[index];

        if (here && flying.current.has(here.key)) {
            released.current = true;

            return;
        }

        panned.current = true;
        released.current = false;
        dragged.current = 0;
        holdStill(true);
    }, [cards, holdStill, index]);

    const onPan = useCallback((_: unknown, info: PanInfo) => {
        if (released.current)
            return;

        if (!axis.current && Math.hypot(info.offset.x, info.offset.y) > 8)
            axis.current = (Math.abs(info.offset.x) > Math.abs(info.offset.y) ? "x" : "y");

        if (axis.current === "y") {
            dragged.current = info.offset.y;
            panY.set(info.offset.y);

            return;
        }

        // Only a song can be rated, so only a song moves sideways
        if (axis.current === "x" && current?.kind === "song")
            xFor(current.key).set(info.offset.x);
    }, [current, panY, xFor]);

    const onPanEnd = useCallback((_: unknown, info: PanInfo) => {
        // Whatever else arrives for this gesture, it has been dealt with
        if (released.current)
            return;

        released.current = true;

        const locked = axis.current;

        axis.current = null;
        holdStill(false);
        setTimeout(() => { panned.current = false; }, 80);

        if (locked === "x" && current?.kind === "song") {
            const outcome = decideSwipe(info.offset.x, info.velocity.x, size.width);

            if (outcome !== "stay") {
                rate(current, outcome === "positive" ? "liked" : "passed", ratingStrength(info.velocity.x));

                return;
            }

            settle(xFor(current.key));

            return;
        }

        if (locked === "y") {
            const outcome = decideSwipe(info.offset.y, info.velocity.y, size.height);

            if (outcome === "negative")
                go(1);
            else if (outcome === "positive" && index > 0)
                go(-1);
            else
                settle(panY);

            return;
        }

        settle(panY);
    }, [current, go, holdStill, index, panY, rate, settle, size.height, size.width, xFor]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName))
                return;

            if (e.key === "ArrowDown") go(1);
            else if (e.key === "ArrowUp") go(-1);
            else if (e.key === "ArrowRight" && current) rate(current, "liked");
            else if (e.key === "ArrowLeft" && current) rate(current, "passed");
        };

        window.addEventListener("keydown", onKey);

        return () => window.removeEventListener("keydown", onKey);
    }, [go, rate, current]);

    /**
     * Back on a card that was rated: it comes in from the side it went.
     *
     * If the rating is still being held, coming back is an undo — the rating is
     * dropped before the server ever hears about it, the heart empties, and the
     * card rebounds on a looser spring than a card that was merely scrolled
     * past, which is what makes it read as undone rather than as revisited.
     */
    useEffect(() => {
        if (!current)
            return;

        const key = current.key;
        const holding = held.current.get(key);
        const away = thrown[key];

        if (!holding && !away)
            return;

        if (holding) {
            clearTimeout(holding.timer);
            held.current.delete(key);
            flights.current.get(key)?.stop();
            flights.current.delete(key);
            flying.current.delete(key);

            setRatings(r => {
                const next = { ...r };

                if (holding.previous)
                    next[key] = holding.previous;
                else
                    delete next[key];

                return next;
            });

            // One tap, and it cancels whatever the rating's own pattern still
            // had queued — otherwise a quick take-back arrives as a buzz
            feelPattern("undone");
        }

        if (away)
            setThrown(t => {
                const next = { ...t };

                delete next[key];

                return next;
            });

        animate(xFor(key), 0, holding && !calm ? UNDONE : (calm ? SETTLE_CALM : SETTLE));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current?.key]);

    /** Leaving is not undoing: whatever is still held goes now. */
    useEffect(() => () => {
        for (const [, holding] of held.current) {
            clearTimeout(holding.timer);
            user.setSongAffinity(holding.songId, holding.affinity)
                .catch(() => { /* Nothing left on screen to put back. */ });
        }

        held.current.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const unlessPanned = useCallback((run: () => void) => () => {
        if (!panned.current)
            run();
    }, []);

    /* ------------------------------------------------------------- milestone */

    useEffect(() => {
        if (current?.kind !== "milestone")
            return;

        user.markFYPAlertViewed(current.alertId).catch(() => { /* It will come round again. */ });

        // A few hundred pieces of canvas confetti is exactly what a device that
        // is already behind cannot afford
        if (!calm)
            confetti({
                particleCount: 220,
                spread: 110,
                origin: { y: 0.42 },
                startVelocity: 55,
                ticks: 420,
                gravity: 1.6,
                colors: [FALLBACK_ACCENT, "#f6f5f8", "#ffcf5a"],
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current?.key]);

    /* ---------------------------------------------------------------- render */

    const onToggle = useMemo(() => unlessPanned(togglePlay), [togglePlay, unlessPanned]);

    return (
        <Box
            ref={page}
            position="fixed"
            inset="0"
            background={PAGE_BG}
            overflow="hidden"
            zIndex="1"
            sx={{
                /*
                 * What a moving page gives up, for as long as it is moving: the
                 * wash's drift, and the blur behind the glass. Both are redrawn
                 * every frame while anything over them moves, and together they
                 * are what made a drag stutter.
                 */
                '&[data-moving="true"] [data-wash] *': { animationPlayState: "paused" },
                '&[data-moving="true"] [data-glass]': {
                    backdropFilter: "none",
                    WebkitBackdropFilter: "none",
                },
                // A device that is behind never gets it back
                ...(calm ? {
                    "[data-glass]": { backdropFilter: "none", WebkitBackdropFilter: "none" },
                } : {}),
            }}
        >
            {/*
              * The cover, lighting the page from above. One strength for the
              * whole layer, set here once; inside it the washes cross-fade, so
              * mid-change the page is never lit by more than one wash's worth.
              */}
            <Box
                data-wash
                position="absolute"
                left="0"
                top="0"
                width="100%"
                height="460px"
                pointerEvents="none"
                zIndex="0"
                opacity={WASH_OPACITY}
            >
                {washes.map(wash => (
                    <motion.div
                        key={wash.art}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: wash.leaving ? 0 : 1 }}
                        transition={{ duration: washFade, ease: "easeInOut" }}
                        style={{ position: "absolute", inset: 0 }}
                    >
                        <ArtworkWash
                            src={wash.art}
                            palette={wash.palette}
                            still={wash.leaving || !playing}
                            detail={calm ? "quiet" : "full"}
                        />
                    </motion.div>
                ))}
            </Box>

            {/* A milestone has no cover, so it is lit in the app's own colour */}
            <Box
                position="absolute"
                left="0"
                top="0"
                width="100%"
                height="460px"
                pointerEvents="none"
                zIndex="0"
                opacity={milestone ? 1 : 0}
                transition={`opacity ${WASH_FADE_S}s ease-in-out`}
                style={{ background: `radial-gradient(120% 90% at 50% 0%, ${FALLBACK_ACCENT}55 0%, ${FALLBACK_ACCENT}00 70%)` }}
            />

            {!loadedOnce && <LoadingCard />}

            {loadedOnce && cards.length === 0 && (seenBefore ? (
                // Everything the server has was dealt already, earlier this quarter-hour
                <EmptyState title="You're all caught up" action={{ label: "Show them again", run: dealAgain }}>
                    New songs turn up here as your friends listen, and as Tempo learns what you like.
                </EmptyState>
            ) : (
                <EmptyState title="Nothing to discover yet">
                    Tempo finds songs in what you and your friends play. Listen to a few and come back.
                </EmptyState>
            ))}

            {cards.map((card, i) => {
                const offset = i - index;

                if (Math.abs(offset) > 1)
                    return null;

                const isCurrent = offset === 0;
                const away = thrown[card.key];

                return (
                    <CardLayer
                        key={card.key}
                        offset={offset}
                        height={size.height}
                        panY={panY}
                        x={xFor(card.key)}
                        lead={xFor(cards[index]?.key ?? "end")}
                        width={size.width}
                        parkedAt={away ? away * size.width * THROW_OUT : null}
                        isCurrent={isCurrent}
                        onPanStart={onPanStart}
                        onPan={onPan}
                        onPanEnd={onPanEnd}
                        calm={calm}
                    >
                        {card.kind === "milestone"
                            ? <MilestoneCard tier={card.tier} calm={calm} />
                            : (
                                <SongCard
                                    card={card}
                                    isCurrent={isCurrent}
                                    calm={calm}
                                    tint={isCurrent ? tint : null}
                                    accentInk={isCurrent ? accentInk : FALLBACK_ACCENT}
                                    rating={ratings[card.key]}
                                    tones={coverTones[artOf(card) ?? ""]}
                                    pan={xFor(card.key)}
                                    playing={isCurrent && playing}
                                    started={isCurrent && started}
                                    progress={progress}
                                    preview={isCurrent && preview?.songId === card.song.id ? preview.url : undefined}
                                    onToggle={onToggle}
                                    onRate={rating => unlessPanned(() => rate(card, rating))()}
                                    openProfile={openProfile}
                                />
                            )}
                    </CardLayer>
                );
            })}

            {atEnd && cards.length > 0 && (
                <CardLayer
                    key="end"
                    offset={0}
                    height={size.height}
                    panY={panY}
                    x={xFor("end")}
                    lead={xFor("end")}
                    width={size.width}
                    parkedAt={null}
                    isCurrent
                    onPanStart={onPanStart}
                    onPan={onPan}
                    onPanEnd={onPanEnd}
                    calm={calm}
                >
                    {ended ? (
                        <EmptyState
                            title="You're all caught up"
                            action={{ label: "Back to the first", run: () => setIndex(0) }}
                        >
                            New songs turn up here as your friends listen, and as Tempo learns what you like.
                        </EmptyState>
                    ) : (
                        <LoadingCard />
                    )}
                </CardLayer>
            )}

            {loading && loadedOnce && !atEnd && index >= cards.length - 1 && (
                <Text
                    position="absolute"
                    bottom={BOTTOM_CLEAR}
                    width="100%"
                    textAlign="center"
                    fontSize="12px"
                    color={INK_FAINT}
                    zIndex="3"
                >
                    Finding more…
                </Text>
            )}
        </Box>
    );
}

/* =============================================================== one layer */

/**
 * One card's place in the stack.
 *
 * Its own component so that the transforms can be hooks — how many cards are
 * on screen changes, and hooks cannot be called in a loop over them.
 */
function CardLayer({
    offset,
    height,
    panY,
    x,
    lead,
    width,
    parkedAt,
    isCurrent,
    onPanStart,
    onPan,
    onPanEnd,
    calm,
    children,
}: Readonly<{
    offset: number;
    height: number;
    panY: MotionValue<number>;
    x: MotionValue<number>;
    /** The sideways movement of the card on top, which the one underneath follows. */
    lead: MotionValue<number>;
    width: number;
    /** Where a thrown card stays, or null for a card still in the stack. */
    parkedAt: number | null;
    isCurrent: boolean;
    onPanStart: () => void;
    onPan: (event: unknown, info: PanInfo) => void;
    onPanEnd: (event: unknown, info: PanInfo) => void;
    calm: boolean;
    children: React.ReactNode;
}>) {
    /*
     * The next card waits a screen below, for scrolling. While the card on top
     * is being taken sideways it waits underneath instead — same place, a size
     * smaller, entirely hidden behind the sleeve above it — and grows as the
     * top card goes, so a toss uncovers the next card rather than making way
     * for one. The switch between the two places happens only while the top
     * card is at rest, when this one cannot be seen in either.
     */
    const underneath = (leadX: number) => offset === 1 && leadX !== 0;
    const gone = (leadX: number) => Math.min(1, Math.abs(leadX) / width);

    const y = useTransform([panY, lead], ([value, leadX]: number[]) =>
        (underneath(leadX) ? 0 : offset * height + value));
    const scale = useTransform(lead, leadX => (underneath(leadX) ? 0.9 + 0.1 * gone(leadX) : 1));
    // Its words wait for the words above to be mostly out of the way: two titles
    // on top of each other is the one thing a stack must not show
    const reveal = useTransform(lead, leadX =>
        (underneath(leadX) ? Math.max(0, Math.min(1, (gone(leadX) - 0.6) / 0.4)) : 1));
    const across = useTransform(x, value => (parkedAt === null ? value : parkedAt));
    // A card leans into the direction it is being taken, and no further
    const rotate = useTransform(across, value => Math.max(-18, Math.min(18, value / 24)));

    return (
        <motion.div
            onPanStart={isCurrent ? onPanStart : undefined}
            onPan={isCurrent ? onPan : undefined}
            onPanEnd={isCurrent ? onPanEnd : undefined}
            // Transforms only. An opacity here would make this a backdrop root,
            // and the glass on the card would stop blurring the artwork
            style={{
                position: "absolute",
                inset: 0,
                x: across,
                y,
                scale,
                rotate: calm ? 0 : rotate,
                touchAction: "none",
                zIndex: isCurrent ? 2 : 1,
                // Nothing outside a card affects what is inside it
                contain: "layout paint",
            }}
            aria-hidden={!isCurrent}
        >
            <Reveal.Provider value={reveal}>
                {children}
            </Reveal.Provider>
        </motion.div>
    );
}

/* ================================================================ song card */

function Reason({
    card,
    tint,
    accentInk,
    openProfile,
}: Readonly<{
    card: Extract<DiscoverCard, { kind: "song" }>;
    tint: Rgb | null;
    accentInk: string;
    openProfile?: (userId: string) => void;
}>) {
    const fill = tint ? chipFill(tint) : SURFACE_HI;
    const { reason } = card;

    const chip = (children: React.ReactNode, onClick?: () => void, label?: string) => (
        <HStack
            as={onClick ? "button" : "div"}
            onClick={onClick}
            aria-label={label}
            gap="7px"
            alignSelf="flex-start"
            paddingY="4px"
            paddingLeft={reason.type === "friend-play" ? "4px" : "9px"}
            paddingRight="11px"
            borderRadius="full"
            background={fill}
            transition="background .45s"
            maxWidth="100%"
            minWidth="0"
            cursor={onClick ? "pointer" : "default"}
        >
            {children}
        </HStack>
    );

    const words = (text: string, colour: string, weight = "700") => (
        <Text fontFamily="Inter" fontWeight={weight} fontSize="12px" letterSpacing="-0.005em" color={colour} noOfLines={1} transition="color .45s">
            {text}
        </Text>
    );

    if (reason.type === "taste")
        return chip(<>
            <Box color={accentInk} flexShrink={0} transition="color .45s"><Sparkles size={13} strokeWidth={2.4} /></Box>
            {words(matchLabel(reason.match), accentInk)}
            {words("with your taste", INK_DIM, "600")}
        </>);

    if (reason.type === "friend-pick")
        return chip(<>
            <Box color={accentInk} flexShrink={0} transition="color .45s"><Users size={13} strokeWidth={2.4} /></Box>
            {words("Your friends are playing this", accentInk)}
        </>);

    const friend: DiscoverFriend = reason.friend;

    return chip(<>
        <Box width="22px" height="22px" flexShrink={0} borderRadius="full" overflow="hidden">
            {friend.pfpUrl ? (
                <SkeletonImage
                    width="22px"
                    height="22px"
                    borderRadius="full"
                    src={getSizedImageUrl(friend.pfpUrl, 44, 44)}
                    blurHash={friend.pfpBlurHash}
                    colourBlob={friend.pfpColourBlob}
                    onError={() => {}}
                />
            ) : (
                <InitialAvatar userId={friend.userId} displayName={friend.username} size="22px" fontSize="10px" />
            )}
        </Box>
        {words(friend.username, INK)}
        {words(`${playNote(friend)} · ${sinceShort(friend.playedAt, Date.now())}`, accentInk, "600")}
    </>, openProfile ? () => openProfile(friend.userId) : undefined, `Open ${friend.username}'s profile`);
}

/**
 * How far through the preview, along the foot of the sleeve.
 *
 * Driven by the motion value, so a preview playing does not re-render the card
 * four times a second — which it did, for thirty seconds at a time.
 */
function ProgressLine({
    progress,
    light,
    shown,
}: Readonly<{ progress: MotionValue<number>; light: boolean; shown: boolean }>) {
    const scaleX = useTransform(progress, value => Math.max(0, Math.min(1, value)));

    return (
        <Box
            position="absolute"
            left="0"
            right="0"
            bottom="0"
            height="3px"
            background={light ? "rgba(0,0,0,0.14)" : "rgba(0,0,0,0.32)"}
            opacity={shown ? 1 : 0}
            transition="opacity .3s, background .25s"
        >
            <motion.div
                style={{
                    scaleX,
                    transformOrigin: "left center",
                    height: "100%",
                    background: light ? "rgba(18,18,21,0.85)" : "rgba(255,255,255,0.92)",
                }}
            />
        </Box>
    );
}

/**
 * An action on the song, as a bare glyph with a finger-sized target.
 *
 * It grows and takes the accent as the card is dragged its way, read straight
 * off the drag: a value, so the card is not re-rendered on the way.
 */
function ActionGlyph({
    label,
    onClick,
    pan,
    towards,
    active,
    activeColour,
    children,
}: Readonly<{
    label: string;
    onClick: () => void;
    pan: MotionValue<number>;
    /** 1 for the action on the right, -1 for the one on the left. */
    towards: 1 | -1;
    active: boolean;
    activeColour: string;
    children: React.ReactNode;
}>) {
    const scale = useTransform(pan, value => 1 + Math.min(Math.max(towards * value, 0) / 240, 0.3));
    const colour = useTransform(pan, value => (active || towards * value > 24 ? activeColour : INK));

    return (
        <Center
            as="button"
            aria-label={label}
            onClick={onClick}
            width="46px"
            height="46px"
            flexShrink={0}
            borderRadius="full"
            transition="opacity .12s"
            _active={{ opacity: 0.55 }}
            cursor="pointer"
        >
            <motion.div style={{ scale, color: colour, display: "flex" }}>
                {children}
            </motion.div>
        </Center>
    );
}

const SongCard = memo(function SongCard({
    card,
    isCurrent,
    calm,
    tint,
    accentInk,
    rating,
    tones,
    pan,
    playing,
    started,
    progress,
    preview,
    onToggle,
    onRate,
    openProfile,
}: Readonly<{
    card: Extract<DiscoverCard, { kind: "song" }>;
    isCurrent: boolean;
    calm: boolean;
    tint: Rgb | null;
    accentInk: string;
    rating?: Rating;
    /** Whether the cover is light or dark where the controls sit on it; unknown until read. */
    tones?: CoverTones;
    /** This card's sideways drag, for the actions to read. */
    pan: MotionValue<number>;
    playing: boolean;
    started: boolean;
    progress: MotionValue<number>;
    /** The preview's URL, null when there is none, undefined while it is being looked for. */
    preview: string | null | undefined;
    onToggle: () => void;
    onRate: (rating: Rating) => void;
    openProfile?: (userId: string) => void;
}>) {
    const { song } = card;
    const reveal = useContext(Reveal);
    /*
     * Playable only with a URL in hand. While the lookup is still out the
     * sleeve was focusable and announced as "Play preview", and its handlers
     * returned without playing anything - an action offered to keyboard and
     * screen-reader users that could not work.
     */
    const canPlay = (typeof preview === "string");
    /** Whether to draw the control at all: faded while the preview is looked for, gone if there is none. */
    const mayHavePreview = preview !== null;
    const glass = glassSurface({ tier: "regular", tint: tint ? rgbToHex(tint) : FALLBACK_ACCENT });

    /*
     * The controls on the artwork flip with what is under them, as small glass
     * does: light glass and a dark glyph on a light sleeve, dark glass and a
     * light glyph on a dark one. Until the cover has been read they are drawn
     * for a dark one, with a shadow under the glyph so that even a white sleeve
     * leaves it an edge.
     */
    const onLight = tones?.corner === "light";
    const footOnLight = tones?.foot === "light";
    const glyph = (onLight ? ON_LIGHT : INK);
    const glyphStyle = { filter: (onLight ? "none" : "drop-shadow(0 1px 1.5px rgba(0,0,0,0.45))"), transition: "color .25s" };

    return (
        <Stack
            height="100%"
            paddingTop={TOP_CLEAR}
            paddingBottom={BOTTOM_CLEAR}
            paddingX="24px"
            justifyContent="center"
            alignItems="center"
        >
            <Stack
                gap="0"
                width="min(100%, 380px)"
                // Optically centred, a little above the middle: without the panel
                // the card is short, and centred exactly it read as sitting low
                marginBottom="6vh"
            >
                {/* A column of its own, so the chip keeps its width rather than stretching */}
                <motion.div style={{ opacity: reveal, display: "flex", flexDirection: "column" }}>
                    <Reason card={card} tint={tint} accentInk={accentInk} openProfile={openProfile} />
                </motion.div>

                {/* The sleeve, which is also the player */}
                <Box
                    role={canPlay ? "button" : undefined}
                    tabIndex={canPlay ? 0 : undefined}
                    aria-label={canPlay ? (playing ? "Pause preview" : "Play preview") : undefined}
                    onClick={canPlay ? onToggle : undefined}
                    onKeyDown={canPlay ? (e: React.KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onToggle();
                        }
                    } : undefined}
                    cursor={canPlay ? "pointer" : "default"}
                    position="relative"
                    marginTop="14px"
                    width="100%"
                    maxWidth={SLEEVE_MAX}
                    alignSelf="center"
                    sx={{ aspectRatio: "1" }}
                    borderRadius={SLEEVE_RADIUS}
                    overflow="hidden"
                    background={SURFACE_HI}
                    boxShadow="0 26px 50px -18px rgba(0,0,0,0.75)"
                >
                    <SkeletonImage
                        width="100%"
                        height="100%"
                        borderRadius={SLEEVE_RADIUS}
                        src={getSizedImageUrl(song.imageUrl, 640, 640)}
                    />

                    <ProgressLine progress={progress} light={footOnLight} shown={started} />

                    {/*
                      * The one piece of glass: over the artwork, blurring it, and
                      * never over another surface. It fades itself while the
                      * preview is being found, not a wrapper round it, or it would
                      * stop blurring for the length of the fade.
                      */}
                    {mayHavePreview && (
                        <Center
                            data-glass
                            position="absolute"
                            left="14px"
                            bottom="16px"
                            width="50px"
                            height="50px"
                            pointerEvents="none"
                            {...glass}
                            // Light glass on a light sleeve: whiter, so the dark glyph has a ground
                            backgroundColor={onLight ? "rgba(255,255,255,0.6)" : glass.backgroundColor}
                            style={glass.style}
                            opacity={preview === undefined ? 0.55 : 1}
                            transition={`opacity .2s, ${GLASS_TRANSITION}`}
                        >
                            {playing
                                ? <Pause size={20} fill={glyph} color={glyph} style={glyphStyle} />
                                : <Play size={20} fill={glyph} color={glyph} style={{ ...glyphStyle, transform: "translateX(1.5px)" }} />}
                        </Center>
                    )}
                </Box>

                <motion.div style={{ opacity: reveal, display: "flex", flexDirection: "column" }}>
                    <HStack marginTop="18px" gap="8px" alignItems="flex-start" minWidth="0">
                        <Stack gap="3px" flex="1" minWidth="0">
                            <HStack gap="6px" alignItems="flex-start" minWidth="0">
                                <Text
                                    fontFamily="Inter"
                                    fontWeight="800"
                                    fontSize="24px"
                                    letterSpacing="-0.025em"
                                    lineHeight="1.12"
                                    color={INK}
                                    noOfLines={2}
                                    minWidth="0"
                                >
                                    {song.title}
                                </Text>
                                {song.explicit && (
                                    <Box color={INK_FAINT} flexShrink={0} fontSize="20px" height="1.12em" display="flex" alignItems="center">
                                        <MdExplicit />
                                    </Box>
                                )}
                            </HStack>
                            <Text fontSize="15px" color={INK_DIM} noOfLines={1}>
                                {song.artists.join(", ")}
                            </Text>
                            <Text
                                as="a"
                                href={songLink(song.id).url}
                                target="_blank"
                                rel="noopener noreferrer"
                                alignSelf="flex-start"
                                marginTop="5px"
                                fontSize="13px"
                                fontWeight="600"
                                color={accentInk}
                                transition="color .45s"
                            >
                                {preview === null ? `No preview · open in ${songLink(song.id).serviceName}` : `Open in ${songLink(song.id).serviceName}`}
                            </Text>
                        </Stack>

                        {/* Pulled into the margin by the glyphs' own padding, so the heart lines up with the sleeve's edge */}
                        <HStack gap="0" flexShrink={0} marginRight="-11px" marginTop="-7px">
                            <ActionGlyph
                                label="Not for me"
                                onClick={() => onRate("passed")}
                                pan={pan}
                                towards={-1}
                                active={rating === "passed"}
                                activeColour={accentInk}
                            >
                                <X size={27} strokeWidth={2.2} />
                            </ActionGlyph>
                            <ActionGlyph
                                label={rating === "liked" ? "Liked" : "Like"}
                                onClick={() => onRate("liked")}
                                pan={pan}
                                towards={1}
                                active={rating === "liked"}
                                activeColour={accentInk}
                            >
                                <Heart size={25} strokeWidth={2.2} fill={rating === "liked" ? accentInk : "none"} />
                            </ActionGlyph>
                        </HStack>
                    </HStack>
                </motion.div>
            </Stack>
        </Stack>
    );
});

/* ============================================================ other cards */

function MilestoneCard({ tier, calm }: Readonly<{ tier: string; calm: boolean }>) {
    const reveal = useContext(Reveal);

    return (
        <Stack height="100%" paddingTop={TOP_CLEAR} paddingBottom={BOTTOM_CLEAR} paddingX="28px" justifyContent="center">
            <motion.div style={{ opacity: reveal, display: "flex", flexDirection: "column" }}>
                <Stack gap="14px">
                    <Text fontFamily="Inter" fontWeight="800" fontSize="13px" letterSpacing="0.02em" color={FALLBACK_ACCENT}>
                        New listening tier
                    </Text>
                    <Text
                        fontFamily="Inter"
                        fontWeight="800"
                        fontSize="46px"
                        letterSpacing="-0.035em"
                        lineHeight="1.02"
                        color={INK}
                    >
                        {tier}
                    </Text>
                    <Text fontSize="15px" color={INK_DIM} maxWidth="30ch">
                        What you have been playing lately has moved you up. Keep going.
                    </Text>
                    <Text marginTop="18px" fontSize="12px" color={INK_FAINT}>
                        Swipe up for your next song
                    </Text>
                </Stack>
            </motion.div>
        </Stack>
    );
}

function EmptyState({
    title,
    children,
    action,
}: Readonly<{ title: string; children: React.ReactNode; action?: { label: string; run: () => void } }>) {
    return (
        <Stack height="100%" paddingTop={TOP_CLEAR} paddingBottom={BOTTOM_CLEAR} paddingX="28px" justifyContent="center">
            <Stack gap="10px">
                <Text fontFamily="Inter" fontWeight="800" fontSize="26px" letterSpacing="-0.025em" color={INK}>
                    {title}
                </Text>
                <Text fontSize="15px" color={INK_DIM} maxWidth="32ch">
                    {children}
                </Text>
                {action && (
                    <Text
                        as="button"
                        alignSelf="flex-start"
                        marginTop="10px"
                        fontFamily="Inter"
                        fontWeight="700"
                        fontSize="14px"
                        color={FALLBACK_ACCENT}
                        onClick={action.run}
                    >
                        {action.label} &rsaquo;
                    </Text>
                )}
            </Stack>
        </Stack>
    );
}

function LoadingCard() {
    return (
        <Stack height="100%" paddingTop={TOP_CLEAR} paddingBottom={BOTTOM_CLEAR} paddingX="24px" justifyContent="center" alignItems="center" position="absolute" inset="0">
            <Stack gap="0" width="min(100%, 380px)" marginBottom="6vh" aria-label="Loading Discover">
                <Skeleton height="30px" width="46%" borderRadius="full" startColor={SURFACE_HI} endColor="#26252b" />
                <Skeleton marginTop="14px" width="100%" maxWidth={SLEEVE_MAX} alignSelf="center" sx={{ aspectRatio: "1" }} borderRadius={SLEEVE_RADIUS} startColor={SURFACE_HI} endColor="#26252b" />
                <Skeleton marginTop="20px" height="24px" width="70%" borderRadius="6px" startColor={SURFACE_HI} endColor="#26252b" />
                <Skeleton marginTop="8px" height="16px" width="40%" borderRadius="6px" startColor={SURFACE_HI} endColor="#26252b" />
                <Skeleton marginTop="10px" height="13px" width="28%" borderRadius="6px" startColor={SURFACE_HI} endColor="#26252b" />
            </Stack>
        </Stack>
    );
}
