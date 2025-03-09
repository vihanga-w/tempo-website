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

        fetch(API_URL + "/appauth/complete/" + swapToken);

        setTimeout(() => {
          setDelayed(true);
        }, 1e3);
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