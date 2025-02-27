import { Uplink } from "@/lib/uplink";
import { UserLookupResult, UserLookupResultType } from "@/components/user-lookup-result";

import { Box, HStack, Input, Stack, Tag, TagLabel, useColorModeValue } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { FaCross, FaX } from "react-icons/fa6";

export function UserSelectDropdown({
    uplink,
    onSelectUser,
}: {
    uplink: Uplink;
    onSelectUser: (users: UserLookupResultType[]) => void;
}) {
    const isValid = true;

    const [addedUsers, setAddedUsers] = useState<UserLookupResultType[]>([]);
    const [searchResUsers, setSearchResUsers] = useState<UserLookupResultType[]>([]);
    const [lookupTimeout, setLookupTimeout] = useState<NodeJS.Timeout>();
    const [query, setQuery] = useState<string>("");

    const inputEl = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        onSelectUser(addedUsers);
    }, [addedUsers]);

    const themeColourVariant = useColorModeValue("light", "dark");
    const textColour = useColorModeValue("text.light", "text.dark");
    
    return (<>
        {/* <Input valid={1} /> */}
        <Box
            height="38px"
            background="rgba(255, 255, 255, 0.04)"
            borderLeft="none"
            borderRight="none"
            borderTop="none"
            borderBottom={`1px solid ${isValid ? `var(--chakra-colors-accent-${themeColourVariant})` : "indianred"}`}
            transition=".25s"
            overflowX="hidden"
        >
            <HStack
                gap="0px"
                display="flex"
                alignItems="center"
                height="100%"
                marginLeft={addedUsers.length == 0 ? "0px" : "5px"}
                marginRight={addedUsers.length == 0 ? "0px" : "5px"}
                width="100vw"
            >
                <HStack gap="5px" width="auto">
                    {addedUsers.map(v => {
                        return (
                            <Tag size='md' height="26px" width="auto" colorScheme='red' borderRadius='full' paddingLeft="8px" paddingRight="8px">
                                <TagLabel>{v.firstName.length < 4 ? `${v.firstName} ${v.lastName}` : v.firstName}</TagLabel>
                            </Tag>
                        );
                    })}
                </HStack>
                <Input
                    outline="none"
                    borderRadius="0"
                    border="none"
                    width="100vw"
                    value={query}
                    ref={inputEl}
                    onKeyDown={e => {
                        const prevValue = (e.target as HTMLInputElement).value;
                        const key = e.key;

                        if (prevValue !== "" || key !== "Backspace")
                            return;

                        setAddedUsers(prev => {
                            if (prev.length == 1)
                                return [];

                            return prev.slice(0, prev.length - 1);
                        });
                    }}
                    onChange={(e) => {
                        setQuery(e.target.value);

                        e.target.parentElement?.parentElement?.scrollTo({
                            left: 0,
                        });

                        // const onSearchFieldChange = (e: ChangeEvent<HTMLInputElement>) => {
                        if (lookupTimeout) clearTimeout(lookupTimeout);
                
                        setLookupTimeout(setTimeout(() => {
                            if (e.target.value.trim() == "") {
                                setSearchResUsers([]);
                                
                                return;
                            }
                
                            uplink.pushFrameSync({
                                type: "lookup-user",
                                payload: e.target.value.trim(),
                            }, (data, cb) => {
                                if (data.type == "error") return;
                
                                const results = JSON.parse(data.payload as string) as UserLookupResultType[];
                
                                // Show results where we have not already added that user
                                setSearchResUsers(results.filter(v => !addedUsers.map(u => u.id).includes(v.id)));
                    
                                cb();
                            });
                        }, 320));
                        // }
                    }}
                />
            </HStack>
        </Box>
        <Box>
            {searchResUsers.map((v, i) => {
                return (<Box marginTop={i == 0 ? "10px" : "0px"}>
                    <UserLookupResult
                        userId={v.id}
                        firstName={v.firstName}
                        lastName={v.lastName}
                        profession={v.profession}
                        gravatarHash={v.gravatarHash}
                        firstItem={i == 0}
                        onClick={(userId) => {
                            setAddedUsers(prev => {
                                const res = searchResUsers.find(v => v.id == userId);

                                if (!res)
                                    return prev;

                                return [...prev, ...[res]];
                            });
                            setQuery("");
                            setSearchResUsers([]);

                            if (inputEl.current) {
                                inputEl.current.focus();
                                inputEl.current.parentElement?.parentElement?.scrollTo({
                                    left: 0,
                                });
                            }
                        }}
                    />
                </Box>);
            })}
        </Box>
    </>);
}