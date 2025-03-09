"use client";

import { Box, Heading, Text, Button } from "@chakra-ui/react";

export default function AuthSuccess() {
  const handleClose = () => {
    if (typeof window !== "undefined") {
      window.close();
    }
  };

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height="100vh"
      bg="gray.50"
      p={4}
    >
      <Heading mb={4}>Authentication Successful</Heading>
      <Text mb={6}>You may now close this window.</Text>
      <Button onClick={handleClose} colorScheme="blue">
        Close Window
      </Button>
    </Box>
  );
}