'use client';

import { ChakraProvider } from '@chakra-ui/react';
import { useEffect } from 'react';
import { listenForAppLinks } from '@/lib/app-links';
import { theme } from './theme';

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  // Links that open the app (Lilt's hand-off to /connect) land wherever the app is: every page.
  useEffect(listenForAppLinks, []);
  return <ChakraProvider theme={theme}>{children}</ChakraProvider>;
}