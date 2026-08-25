"use client";

import { API_URL } from "@/lib/const";
import { Box, Heading, Text, Button, Center, Stack } from "@chakra-ui/react";
import { useEffect, useState } from "react";

export default function AuthSuccess() {
  const [delayed, setDelayed] = useState<boolean>(false);
  
    useEffect(() => {
        if (!window.location)
            return;

        const swapToken = window.location.search.split("st=")[1].split("&")[0];

        // This is what tells the app its sign-in landed, so it happens whether
        // or not anybody ever reads the line below
        fetch(API_URL + "/appauth/complete/" + swapToken);

        /*
         * Only for somebody who has been left to close this themselves.
         *
         * The app closes this window as soon as it hears the sign-in landed,
         * and the wait above was shorter than that takes - so people finishing
         * set-up in the app were told to close a page that was about to close
         * itself, which is the last thing they should be reading at the end of
         * it. Long enough now that seeing it means something really is stuck.
         */
        setTimeout(() => {
          setDelayed(true);
        }, 6e3);
    }, []);

    return (<Center background="#0D0D0E" padding="15%" pos="fixed" width="100vw" height="100vh" top="0" left="0">
        <Stack gap="15px">
          <Text
            fontFamily="arial, helvetica"
            fontSize="20px"
            width="100%"
            textAlign="center"
            opacity={delayed ? "0.85" : "0"}
          >Authorisation successful, you may now close this page</Text>
        </Stack>
      </Center>);
}