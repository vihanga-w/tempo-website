"use client"

import { useState } from "react"
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
} from "@chakra-ui/react"
import PageRouter from "@/lib/page-router"
// import { CheckCircle, Shield } from "lucide-react"

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
  const [agreed, setAgreed] = useState(false)

  return (
    <ChakraProvider theme={theme}>
      <Flex minHeight="100vh" direction="column" bg="#0D0D0E">
        <Container maxW="container.md" py={6} flex="1" display="flex" flexDirection="column">
          <Center mt={10} mb={8}>
            <Box
              bg="dark.800"
              p={4}
              borderRadius="full"
              boxSize="16"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              {/* <Shield size={32} color="#3B44FF" /> */}
            </Box>
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
                  By using this application, you agree to be bound by our Terms and Conditions and acknowledge that you
                  have read our Privacy Policy.
                </Text>
                <Text>
                  <Link href="/terms" textDecoration="underline">
                    Terms and Conditions
                  </Link>
                  {" and "}
                  <Link href="/privacy" textDecoration="underline">
                    Privacy Policy
                  </Link>
                </Text>
              </Stack>
            </Box>

            <Flex alignItems="flex-start" pt={2} gap={3}>
              <Checkbox
                id="terms"
                isChecked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                colorScheme="purple"
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
              size="lg"
              onClick={() => {
                prouter.setPage("app");
              }}
            >
              {agreed ? (
                <Flex align="center" gap={2}>
                  {/* <CheckCircle size={16} /> */}
                  <Text>Continue</Text>
                </Flex>
              ) : (
                "Continue"
              )}
            </Button>
          </Box>
        </Container>
      </Flex>
    </ChakraProvider>
  )
}