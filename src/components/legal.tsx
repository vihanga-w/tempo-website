"use client"

import { useEffect, useState } from "react"
import {
  Box,
  Button,
  Center,
  Checkbox,
  ChakraProvider,
  Container,
  Flex,
  Heading,
  Link,
  Stack,
  Text,
  extendTheme,
  useDisclosure,
  Image,
} from "@chakra-ui/react"
import PageRouter from "@/lib/page-router"
import LegalDrawer from "./legal-drawer"

// Create a custom theme with our colors
const theme = extendTheme({
  styles: {
    global: {
      body: {
        bg: "#0D0D0E",
        color: "white",
      },
    },
  },
  colors: {
    accent: {
      500: "#3B44FF",
      600: "#2A33EE",
    },
    dark: {
      800: "#1A1A1A",
      900: "#0D0D0E",
    },
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: "semibold",
      },
    },
    Link: {
      baseStyle: {
        color: "#3B44FF",
        _hover: {
          textDecoration: "underline",
          color: "#5059FF",
        },
      },
    },
  },
})

export default function LegalPage({
    prouter
}: Readonly<{
    prouter: PageRouter;
}>) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [agreed, setAgreed] = useState(false);
  const [legalPage, setLegalPage] = useState<"terms" | "privacy" | "">("");

  useEffect(() => {
    if (legalPage == "") {
        onClose();

        return;
    }

    onOpen();
  }, [legalPage]);

  useEffect(() => {
    if (!isOpen)
        setLegalPage("");
  }, [isOpen]);

  return (
    <ChakraProvider theme={theme}>
      <LegalDrawer open={onOpen} close={onClose} isOpen={isOpen} page={legalPage == "" ? "terms" : legalPage} />

      <Flex minHeight="100vh" direction="column" bg="#0D0D0E">
        <Container maxW="container.md" py={6} px={5} flex="1" display="flex" flexDirection="column">
          <Center mt={10} mb={8}>
            <Image
                src={`/icons/ui/logo-clear.svg`}
                alt="Tempo logo"
                width="72px"
                marginBottom="16px"
                userSelect="none"
              />
          </Center>

          <Heading textAlign="center" mb={6} size="lg">
            Terms & Conditions
          </Heading>

          <Stack spacing={6} mb={8}>
            <Text color="gray.300">
              Before you continue, please read and agree to our Terms and Conditions and Privacy Policy.
            </Text>

            <Box bg="dark.800" p={5} borderRadius="md">
              <Stack spacing={4} fontSize="sm" color="gray.300">
                <Text>
                  By using Tempo., you agree to be bound by our Terms and Conditions and acknowledge that you
                  have read our Privacy Policy.
                </Text>
                <Text>
                  View our{" "}
                  <Link href="#" onClick={() => {
                    setLegalPage("terms");
                  }} textDecoration="underline">
                    Terms and Conditions
                  </Link>
                  {" and "}
                  <Link href="#" onClick={() => {
                    setLegalPage("privacy");
                  }} textDecoration="underline">
                    Privacy Policy
                  </Link>
                  .
                </Text>
              </Stack>
            </Box>

            <Flex alignItems="flex-start" pt={2} gap={3}>
              <Checkbox
                id="terms"
                isChecked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                // colorScheme="purple"
                borderColor="gray.600"
                mt={1}
                sx={{
                  "& .chakra-checkbox__control[data-checked]": {
                    backgroundColor: "#3B44FF",
                    borderColor: "#3B44FF",
                  },
                }}
              />
              <Text fontSize="sm" color="gray.200">
                I have read and agree to the Terms and Conditions and Privacy Policy
              </Text>
            </Flex>
          </Stack>

          <Box mt="auto">
            <Button
              isDisabled={!agreed}
              width="full"
              bg="#3B44FF"
              _hover={{ bg: "#2A33EE" }}
              _disabled={{ bg: "gray.700", cursor: "not-allowed" }}
              py={6}
              marginBottom="20px"
              size="lg"
              onClick={() => {
                window.localStorage.setItem("tempo-legal-agreed", Date.now().toString());
                prouter.setPage("app");
              }}
            >
              {"Continue"}
            </Button>
          </Box>
        </Container>
      </Flex>
    </ChakraProvider>
  )
}