import { ChangeEvent, use, useEffect, useState } from "react";
import { Avatar, Box, Center, Stack, Text, useColorModeValue } from "@chakra-ui/react";
import { Input } from "./mchat-input";
import { ChakraStylesConfig, Select } from "chakra-react-select";
// import { InteractiveButtonBox as test, VisualViewPortHandler } from "./interactive-btn-box";
import { StyledBtn } from "./button";
import { InteractiveButtonBox } from "./interactive-btn-box";
import { UserLookupResult, UserLookupResultType } from "@/components/user-lookup-result";
import User, { ClientUserAccount } from "@/lib/usrlib";
import { findBestSCDNImageSize } from "@/lib/utils";

export default function AddFriendsPage({
    user,
}: {
    user: User;
}) {
    const [lookupTimeout, setLookupTimeout] = useState<NodeJS.Timeout | undefined>();
    const [lookupResults, setLookupResults] = useState<UserLookupResultType[]>([]);

    /*
     * Friends of your friends, shown when the field is empty.
     *
     * Held apart from the search results rather than mixed into them: these are
     * an answer to a question nobody asked, so they belong under their own
     * heading and have to disappear the moment somebody does ask one.
     */
    const [suggested, setSuggested] = useState<UserLookupResultType[]>([]);
    const [searching, setSearching] = useState(false);

    const toRow = (v: {
        user: ClientUserAccount;
        mutualFriends: UserLookupResultType["mutual"];
        friendState: UserLookupResultType["frState"];
        friendshipId?: string;
    }): UserLookupResultType => {
        // Spotify's own CDN has the sizes worth asking for; anything else is
        // taken as it comes
        const ideal = v.user.images.filter(image => image.url.startsWith("https://i.scdn."));

        const source = (ideal.length > 0 ? ideal : v.user.images);

        return {
            id: v.user.id,
            pfpUrl: (source.length > 0 ? findBestSCDNImageSize(source, 56, 56) ?? undefined : undefined),
            username: v.user.displayName,
            mutual: v.mutualFriends,
            frState: v.friendState,
            frId: v.friendshipId,
        };
    };

    const handler = async (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.value.trim() == "") {
            setSearching(false);

            // Both at once: neither is waiting on the other, and the page is
            // empty until whichever is slower arrives
            const [incoming, suggestions] = await Promise.all([
                user.getFriends(["incoming"]),
                user.getFriendSuggestions(20),
            ]);

            setSuggested(suggestions.map(toRow));

            if (incoming.length == 0) {
                setLookupResults([]);
                return;
            }

            const incomingUsers = await Promise.all(incoming.map(async v => {
                const u = await user.searchUsers(v.u1Id == user.object?.id ? v.u2Id : v.u1Id, 1);

                if (u.length == 0)
                    return null;

                return {
                    id: u[0].user.id,
                    pfpUrl: u[0].user.images.length > 0 ? findBestSCDNImageSize(u[0].user.images, 56, 56) : undefined,
                    username: u[0].user.displayName,
                    mutual: u[0].mutualFriends,
                    frState: u[0].friendState,
                    frId: u[0].friendshipId,
                };
            }));

            setLookupResults(incomingUsers.filter(v => v != null) as UserLookupResultType[]);

            return;
        }

        setSearching(true);
        setSuggested([]);

        try {
            const results = await user.searchUsers(e.target.value, 25);

            setLookupResults(results.map(toRow));
        } catch (ex) {
            console.warn("User lookup query failed, error:", ex);
        }
    };

    const onSearchFieldChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (lookupTimeout) clearTimeout(lookupTimeout);

        setLookupTimeout(setTimeout(async () => {
            await handler(e);
        }, lookupResults.length > 0 ? 320 : 0));
    };

    useEffect(() => {
        handler({ target: { value: "" } } as ChangeEvent<HTMLInputElement>);
    }, []);

    return (<>
        <Stack gap="34px">
            <Text
                marginTop="24px"
                fontFamily="Inter"
                fontWeight="regular"
                fontSize="16px"
                opacity="0.75"
            >
                Everything's better with friends — Tempo too! Add friends to share Spotify activity and explore each other's music tastes.
            </Text>
            <Box>
                <Stack gap="20px">
                    <Input
                        // label="Search for someone"
                        placeholder="Search for someone"
                        valid={1}
                        onChange={onSearchFieldChange}
                    />
                    <Box height="calc(100vh - 275px)" overflowY="auto" position="relative">
                        {/*
                          * Deduped here as well as on the server.
                          *
                          * The key below used to carry the array index to stay
                          * unique, which is what a list does when the same
                          * person can appear in it twice — and an index in a key
                          * costs you the identity React needs to keep a row's
                          * state across a re-render.
                          */}
                        {lookupResults
                            .filter(v => v.id !== user.object?.id)
                            .filter((v, i, all) => all.findIndex(other => other.id === v.id) === i)
                            .map((v, i) => {
                            return (
                                <UserLookupResult
                                    userId={v.id}
                                    username={v.username}
                                    pfpUrl={v.pfpUrl}
                                    firstItem={i == 0}
                                    mutualFriends={v.mutual}
                                    friendState={v.frState}
                                    friendshipId={v.frId}
                                    // onClick={onCommit}
                                    user={user}
                                    key={v.id}
                                />
                            );
                        })}

                        {/*
                          * Under their own heading, and only while the field is
                          * empty. These were not asked for, so they must not be
                          * mistaken for an answer — and the moment somebody does
                          * ask, they go.
                          */}
                        {!searching && suggested.length > 0 && (<>
                            <Text
                                fontFamily="Inter"
                                fontWeight="bold"
                                fontSize="16px"
                                opacity="0.75"
                                marginTop={lookupResults.length > 0 ? "26px" : "6px"}
                                marginBottom="6px"
                                userSelect="none"
                            >
                                People you may know
                            </Text>

                            {suggested.map((v, i) => (
                                <UserLookupResult
                                    userId={v.id}
                                    username={v.username}
                                    pfpUrl={v.pfpUrl}
                                    firstItem={i === 0}
                                    mutualFriends={v.mutual}
                                    friendState={v.frState}
                                    friendshipId={v.frId}
                                    user={user}
                                    key={v.id}
                                />
                            ))}
                        </>)}
                    </Box>
                </Stack>
            </Box>
        </Stack>
    </>);
}