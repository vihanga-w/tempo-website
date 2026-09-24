import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import { X } from "lucide-react";
import { MdExplicit } from "react-icons/md";

import { reasonLine, type PlaylistSong } from "@/lib/playlists";
import { getSizedImageUrl } from "@/lib/sized-img";
import { SkeletonImage } from "./playback-state";
import { songLink } from "../lib/music-links";
import { FriendChip, type CoverFriend } from "./playlist-cover";

/** The page's ink, as Discover sets it. */
export const INK = "#f6f5f8";
export const INK_DIM = "#9d9aa6";
export const INK_FAINT = "#65626e";
export const SURFACE_HI = "#1c1b20";
export const ACCENT = "#A480FF";
export const PAGE_BG = "#0D0D0E";
/** The space the shell's title takes above a page, and a breath under it before a heading. */
export const TOP_CLEAR = "calc(var(--safe-area-inset-top, 0px) + 72px)";
/** Clear of the menu button: its inset, its size, and a gap. */
export const BOTTOM_CLEAR = "calc(var(--safe-area-inset-bottom, 0px) + 22px + 52px + 22px)";

/**
 * One song in a playlist, with the reason it is there under its name.
 *
 * The reason is the line that makes this Tempo's playlist rather than
 * Spotify's, so it is set in the accent and given the width. The cover opens
 * the song in Spotify; the cross, when there is one, takes the song out.
 */
export function PlaylistSongRow({
    song,
    now,
    onRemove,
    openProfile,
    accent = ACCENT,
    friends = [],
}: Readonly<{
    song: PlaylistSong;
    now: number;
    /** Offered only where a song can be taken out: a kept playlist, not a preview. */
    onRemove?: (songId: string) => void;
    openProfile?: (userId: string) => void;
    /** The ink for the reason: the playlist's own, or the app's. */
    accent?: string;
    /** The people behind the playlist, for a friend's picture beside their reason. */
    friends?: readonly CoverFriend[];
}>) {
    const friend = (song.reason.type === "friend" ? song.reason : null);
    const chip = friend ? friends.find(f => f.id === friend.userId) ?? { id: friend.userId, name: friend.username } : null;

    return (
        <HStack gap="12px" alignItems="center" minWidth="0" paddingY="8px">
            <Box
                as="button"
                aria-label={`Open ${song.title} in ${songLink(song.id).serviceName}`}
                onClick={() => window.open(songLink(song.id).url)}
                flexShrink={0}
                width="56px"
                height="56px"
                borderRadius="10px"
                overflow="hidden"
                background={SURFACE_HI}
                boxShadow="0 6px 14px -8px rgba(0,0,0,0.8)"
            >
                <SkeletonImage src={getSizedImageUrl(song.imageUrl, 128, 128)} width="56px" height="56px" borderRadius="10px" loading="lazy" />
            </Box>

            <Stack gap="2px" flex="1" minWidth="0">
                <HStack gap="5px" alignItems="center" minWidth="0">
                    <Text fontFamily="Inter" fontWeight="700" fontSize="15px" letterSpacing="-0.01em" color={INK} noOfLines={1} minWidth="0">
                        {song.title}
                    </Text>
                    {song.explicit && (
                        <Box color={INK_FAINT} flexShrink={0} fontSize="15px" display="flex" alignItems="center">
                            <MdExplicit />
                        </Box>
                    )}
                </HStack>
                <Text fontSize="13px" color={INK_DIM} noOfLines={1}>
                    {song.artists.join(", ")}
                </Text>
                <HStack
                    as={friend && openProfile ? "button" : "div"}
                    onClick={friend && openProfile ? () => openProfile(friend.userId) : undefined}
                    gap="6px"
                    alignItems="center"
                    minWidth="0"
                    marginTop="2px"
                >
                    {chip && <FriendChip friend={chip} size={18} />}
                    <Text textAlign="left" fontFamily="Inter" fontWeight="600" fontSize="12px" color={accent} noOfLines={1} minWidth="0">
                        {reasonLine(song.reason, now)}
                    </Text>
                </HStack>
            </Stack>

            {onRemove && (
                <Box
                    as="button"
                    aria-label={`Take ${song.title} out`}
                    onClick={() => onRemove(song.id)}
                    flexShrink={0}
                    width="40px"
                    height="40px"
                    marginRight="-10px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    color={INK_FAINT}
                    _active={{ opacity: 0.55 }}
                >
                    <X size={18} strokeWidth={2.2} />
                </Box>
            )}
        </HStack>
    );
}

/** A section's small label, as the friends page sets one. */
export function SectionLabel({ children }: Readonly<{ children: string }>) {
    return (
        <Text fontFamily="Inter" fontSize="13px" fontWeight="600" letterSpacing="0.02em" color={INK_FAINT} textTransform="uppercase" userSelect="none">
            {children}
        </Text>
    );
}

/** A page's title and its line under, as Discover's empty state sets them. */
export function PageWords({ title, children }: Readonly<{ title: string; children?: React.ReactNode }>) {
    return (
        <Stack gap="6px">
            <Text fontFamily="Inter" fontWeight="800" fontSize="26px" letterSpacing="-0.025em" lineHeight="1.1" color={INK}>
                {title}
            </Text>
            {children && (
                <Text fontSize="15px" color={INK_DIM} maxWidth="36ch">
                    {children}
                </Text>
            )}
        </Stack>
    );
}

/** A line about what just happened, or did not: the server's words, or the page's. */
export function Note({ children }: Readonly<{ children: string }>) {
    return (
        <Text role="status" fontSize="14px" color={ACCENT} maxWidth="40ch">
            {children}
        </Text>
    );
}

/** A quiet text action: an accent word with a chevron, as Discover offers "Back to the first". */
export function TextAction({
    label,
    onClick,
    disabled,
    tone = "accent",
}: Readonly<{ label: string; onClick: () => void; disabled?: boolean; tone?: "accent" | "dim" }>) {
    return (
        <Text
            as="button"
            disabled={disabled}
            onClick={onClick}
            alignSelf="flex-start"
            fontFamily="Inter"
            fontWeight="700"
            fontSize="14px"
            color={tone === "accent" ? ACCENT : INK_DIM}
            opacity={disabled ? 0.5 : 1}
            _active={{ opacity: 0.55 }}
        >
            {label}
        </Text>
    );
}

/** A solid button for the one thing a page is for: making the playlist. */
export function PrimaryButton({ label, onClick, disabled }: Readonly<{ label: string; onClick: () => void; disabled?: boolean }>) {
    return (
        <Box
            as="button"
            disabled={disabled}
            onClick={onClick}
            width="100%"
            height="50px"
            borderRadius="full"
            background={ACCENT}
            color="#121215"
            fontFamily="Inter"
            fontWeight="800"
            fontSize="16px"
            letterSpacing="-0.01em"
            opacity={disabled ? 0.5 : 1}
            transition="opacity .2s"
            _active={{ opacity: 0.7 }}
        >
            {label}
        </Box>
    );
}
