'use client';

import { ChakraProvider } from '@chakra-ui/react';
import { theme } from './theme';

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ChakraProvider theme={theme}>{children}</ChakraProvider>;
}