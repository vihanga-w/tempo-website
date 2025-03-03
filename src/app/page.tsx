'use client';

import styles from "./page.module.css";
import PageRouter from "@/lib/page-router";

import {
  Box,
  Center,
  Text,
  Image,
  useColorModeValue,
  Stack,
  OrderedList,
  ListItem,
  HStack,
  Button,
  useDisclosure,
} from '@chakra-ui/react';
import React, { useEffect, useRef, useState } from "react";

import User from "@/lib/usrlib";
import { API_URL } from "@/lib/const";
import { registerServiceWorker, removeSubscription, useSubscribe } from "@/lib/notify";
import { randomBytes } from "crypto";
import { Modal } from "@/components/modal";

export default function Home() {
  // Application states
  const [debugInjected, setDebugInjected] = useState<boolean>(false);
  const [isInMobileBrowser, setIsInMobileBrowser] = useState<boolean>(false);
  const [hasPreviouslyBeenOpened, setHasPreviouslyBeenOpened] = useState<boolean>(false);
  const [mobileOS, setMobileOS] = useState<"ios" | "android" | "generic">("generic");
  const [deferredPWAInstaller, setDeferredPWAInstaller] = useState<any>();
  const [page, setPage] = useState<JSX.Element>();
  const [perfMsg, setPerfMsg] = useState<string | undefined>();

  const [modalTitle, setModalTitle] = useState<string>("");
  const [modalContent, setModalContent] = useState<JSX.Element>(<></>);
  const [modalPBtn, setModalPBtn] = useState<{ text: string; callback: () => void } | undefined>();
  const [modalSBtn, setModalSBtn] = useState<{ text: string; callback: () => void } | undefined>();

  const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclosure();

  // Element references
  const debuggerConsole = useRef<HTMLTextAreaElement>(null);
  const bgColour = "bg.dark";

  // Notification subscription
  const { getSubscription } = useSubscribe({
    // TODO: Load VAPID public key from server?
    publicKey: "BNFOFLUsXVVvitmhdnJ_jCR9U-c0RAudISRpeDBL-wTOBZaz2y6cltxJa7WbGHLj-6FEI8fJ7g5g8EMmyVkMIMA",
  });

  const triggerModal = (title: string, content: JSX.Element, primaryButton?: {
    text: string;
    callback: () => void;
  }, secondaryButton?: {
    text: string;
    callback: () => void;
  }) => {
    setModalTitle(title);
    setModalContent(content);
    setModalPBtn(primaryButton);
    setModalSBtn(secondaryButton);

    onModalOpen();
  }

  useEffect(() => {
    if (!window) return;

    document.body.style.background = "var(--chakra-colors-bg-dark)";

    if (window.localStorage.getItem("tempo-initial-visit")) setHasPreviouslyBeenOpened(true);
    else window.localStorage.setItem("tempo-initial-visit", "false");

    window.addEventListener("beforeinstallprompt", (e) => {
      setDeferredPWAInstaller(e);
    });

    const userAgent = window.navigator.userAgent.toLowerCase();

    if (/android/.test(userAgent)) {
      // User is on an android
      setMobileOS("android");
    } else if (/iphone|ipad|ipod/.test(userAgent)) {
      // Use is on iOS
      setMobileOS("ios");
    }

    // For debugging purposes only!
    if (!debugInjected) {
      const ogcnslg = console.log;

      console.log = (...d) => {
        let argsString: string[] = ["\n"];

        for (const arg of d) {
          if (typeof arg == "object") {
            argsString.push(JSON.stringify(arg, undefined, 4));
          } else if (typeof arg == "number") {
            argsString.push(arg.toString());
          } else if (typeof arg == "string") {
            argsString.push(arg);
          } else {
            argsString.push(`[${typeof arg}]`);
          }
        }

        if (debuggerConsole.current) {
          debuggerConsole.current.value = debuggerConsole.current.value += argsString.join(" ");
          debuggerConsole.current.scrollTop = debuggerConsole.current.scrollHeight;
        }
        
        ogcnslg("[DEBUG]", ...d);
      }

      setDebugInjected(true);
    }

    // Instantiate a user handler for this session
    const user = new User();

    // Handler for subscribing to push notifications
    const onSubmitSubscribe = async () => {
      if (!user.isLoggedIn) {
        console.error("Attempted to subscribe to notifications without being authorised");
        
        return;
      }

      if (window.localStorage.getItem("tempo-rejected-notifs"))
        return;

      const localAllow = await new Promise<boolean>(resolve => {
        triggerModal("Notifications", (<>
          <Text>
            Would you like to receive notifications from Tempo?
          </Text>
          <Text>
            Allowing notification permissions allows us to send you relevant notifications such as when a friend sends you a message or reacts to a song you are listening to.
          </Text>
        </>), {
          text: "Count me in!",
          callback() {
            resolve(true);
          },
        }, {
          text: "No thanks",
          callback() {
            resolve(false);
          },
        })
      });

      if (!localAllow) {
        window.localStorage.setItem("tempo-rejected-notifs", "true");

        return;
      }

      const allowed = await Notification.requestPermission();

      if (allowed !== "granted") {
        console.warn("User denied notification request");

        return;
      }

      await registerServiceWorker();

      try {
        // Get the subscription object using the getSubscription function
        const subscription = await getSubscription();
        const subId = randomBytes(8).toString("hex");

        console.log("Registering notification handler with id:", subId);

        // Send the subscription object and ID to the server for registration
        const res = await fetch(API_URL + "/notify/subscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: `${user.id}-${subId}`,
            subscription: subscription.toJSON()
          }),
        });

        console.log(await res.json());
        // await axios.post('/api/subscribe', {
        //     subscription: subscription,
        //     id: subscribeId
        // });

        // // Log a message in case of successful subscription
        // console.log('Subscribe success');
      } catch (e) {
        // Log a warning in case of an error
        console.warn(e);

        removeSubscription();
      }
    };

    // Initialise the page router
    const prouter = new PageRouter(user);

    prouter.on("ready", () => {
      // Don't do anything yet, we have not attempted to authenticate the user!
      console.log("Initialised page router!");
    });

    prouter.on("page-navigate", (page: JSX.Element) => {
      console.log("New page navigation event!");
      
      if (page) setPage(page);
    });

    prouter.initRouter();

    user.on("performance-message", (msg) => {
      setPerfMsg(msg);
    });

    user.on("user-init", async () => {
      console.log("User object has been updated! User object:", user);

      setPerfMsg(undefined);

      // TODO: Re-enable this when singup flow has been made
      // prouter.setPage(user.isLoggedIn ? "app" : "signup");

      if (!user.isLoggedIn) {
        window.location.href = API_URL + "/auth/ui";
      } else {
        onSubmitSubscribe();
        prouter.setPage("app");
      }
    });

    // Wait for the user handler to finish initialising
    user.init()
    .then(() => {
      console.log("User handler has been initialised!");
    });

    // Check whether we are in a PWA standalone app
    if (window.navigator && !window.localStorage.getItem("tempo-override-pwa-detection")) setIsInMobileBrowser(!(("standalone" in window.navigator) && window.navigator.standalone));
    else if (window.localStorage.getItem("tempo-override-pwa-detection")) setIsInMobileBrowser(false);
  }, []);

  function triggerInstallPWA() {
    deferredPWAInstaller.prompt();
  }

  return (<>
    <Modal
        title={modalTitle}
        isOpen={isModalOpen}
        onOpen={onModalOpen}
        onClose={onModalClose}
        primaryButton={modalPBtn}
        secondaryButton={modalSBtn}
    >
        {modalContent}
    </Modal>
    <Box background={bgColour} height="100%" width="100%" overflow="auto">
      {isInMobileBrowser ? (
        <>
          <Box
            position="absolute"
            top="40px"
            left="0px"
            paddingLeft="32px"
            paddingRight="32px"
          >
            <Stack gap="5px">
              <Image
                src={`/icons/ui/logo-clear.svg`}
                alt="Tempo logo"
                width="88px"
                marginBottom="16px"
                userSelect="none"
              />
              <Box>
                <Text fontFamily="Inter" fontSize="20px">{!hasPreviouslyBeenOpened ? "Welcome to " : "Welcome back to "}<b>Tempo</b>!</Text>
                <Box overflow="auto">
                  <Stack gap="20px">
                    <Text>Tempo is a social media for your music, think of it like Instagram for music.</Text>
                    <Text>{hasPreviouslyBeenOpened ? "It seems like you have visited this page before. If you have already setup Tempo, please open the app from your home screen, if not, follow the instructions below." : "Before you can start using Tempo, we have to do some setup first!"}</Text>
                    {mobileOS == "generic" ? (<>
                      <Text>We were not able to detect what type of phone you have so the instructions below may not be 100% accurate!</Text>
                      <OrderedList paddingLeft="5px">
                        <ListItem>Open the page settings menu</ListItem>
                        <ListItem>Select option to add to home screen</ListItem>
                        <ListItem>Open Tempo from your home screen</ListItem>
                      </OrderedList>
                    </>) : (<></>)}
                    {mobileOS == "ios" ? (<>
                      <Text>It seems like you are on an iOS device, the instructions below are for iOS devices browsing using Safari.</Text>
                      <OrderedList paddingLeft="5px">
                        <ListItem><HStack><Text>Click on the share</Text><Image margin="-5px" marginBottom="2px" width="20px" src="/icons/ui/ios-share.svg" /><Text>icon</Text></HStack></ListItem>
                        <ListItem>Scroll down and tap on "<b>Add to Home Screen</b>"</ListItem>
                        <ListItem>Click "<b>Add</b>" in the upper right corner</ListItem>
                        <ListItem>Open <b>Tempo</b> from your home screen</ListItem>
                      </OrderedList>
                    </>) : (<></>)}
                    {mobileOS == "android" ? (<>
                      <Text>It seems like you are on an android device. Installing Tempo on android is very easy, just tap the button below and open Tempo from your home screen.</Text>
                      <Button onClick={triggerInstallPWA}>Install Tempo</Button>
                    </>) : (<></>)}
                  </Stack>
                </Box>
              </Box>
            </Stack>
          </Box>
        </>
      ) : !perfMsg ? page : (<>
          <Center background="#0D0D0E" padding="15%" pos="fixed" width="100vw" height="100vh" top="0" left="0">
            <Stack gap="15px">
              <Center width="100%">
                <Image width="100px" src="/icons/ui/logo-clear.svg" />
              </Center>
              <Text
                fontFamily="arial, helvetica"
                fontSize="20px"
                width="100%"
                textAlign="center"
                opacity="0.85"
              >{perfMsg}</Text>
            </Stack>
          </Center>
      </>)}
    </Box>
  </>);
}
