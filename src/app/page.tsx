'use client';

import styles from "./page.module.css";
import PageRouter from "@/lib/page-router";

import "./marquee.css";

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
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from '@capacitor/status-bar';
import { AndroidViewStyle, DefaultAndroidSystemBrowserOptions, DefaultSystemBrowserOptions, DefaultiOSSystemBrowserOptions, DismissStyle, InAppBrowser, iOSViewStyle } from '@capacitor/inappbrowser';
import { Preferences } from '@capacitor/preferences';

import User from "@/lib/usrlib";
import { API_URL, API_URL_SOCK, NOTIF_PROCESSED_KEY, NOTIF_SUB_ID_KEY } from "@/lib/const";
import { registerServiceWorker, removeSubscription, resetStaleSubscription, useSubscribe } from "@/lib/notify";
import { randomBytes } from "crypto";
import { Modal } from "@/components/modal";
import { SafeArea, initialize } from "@capacitor-community/safe-area";
import { SplashScreen } from "@capacitor/splash-screen";

import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";

TimeAgo.addDefaultLocale(en)

export default function Home() {
  // Application states
  const [debugInjected, setDebugInjected] = useState<boolean>(false);
  const [isInMobileBrowser, setIsInMobileBrowser] = useState<boolean>(!Capacitor.isNativePlatform());
  const [hasPreviouslyBeenOpened, setHasPreviouslyBeenOpened] = useState<boolean>(false);
  const [mobileOS, setMobileOS] = useState<"ios" | "android" | "generic">("generic");
  const [deferredPWAInstaller, setDeferredPWAInstaller] = useState<any>();
  const [page, setPage] = useState<JSX.Element>();
  const [perfMsg, setPerfMsg] = useState<string | undefined>();
  const [displayUI, setDisplayUI] = useState<boolean>(false);

  const [modalTitle, setModalTitle] = useState<string>("");
  const [modalContent, setModalContent] = useState<JSX.Element>(<></>);
  const [modalPBtn, setModalPBtn] = useState<{ text: string; callback: () => void } | undefined>();
  const [modalSBtn, setModalSBtn] = useState<{ text: string; callback: () => void } | undefined>();

  const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclosure();

  if (Capacitor.isNativePlatform()) {
    StatusBar.setBackgroundColor({
      color: "#0D0D0E",
    });
  }

  // Element references
  const debuggerConsole = useRef<HTMLTextAreaElement>(null);
  const bgColour = "bg.dark";

  // Notification subscription
  const { getSubscription } = useSubscribe();

  const triggerModal = (title: string, content: JSX.Element, primaryButton?: {
    text?: string;
    callback: () => void;
  }, secondaryButton?: {
    text?: string;
    callback: () => void;
  }) => {
    setModalTitle(title);
    setModalContent(content);

    if (primaryButton?.text)
      setModalPBtn(primaryButton as {
        text: string;
        callback: () => void;
      });
    else
      setModalPBtn(undefined);
    
    if (secondaryButton?.text)
      setModalSBtn(secondaryButton as {
        text: string;
        callback: () => void;
      });
    else
      setModalSBtn(undefined);

    onModalOpen();
  }

  useEffect(() => {
    if (!window) return;

    // if (Capacitor.isNativePlatform())
    //   StatusBar.setOverlaysWebView({ overlay: false });

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

    initialize();
    SafeArea.enable({
      config: {
        customColorsForSystemBars: true,
        statusBarColor: '#0D0D0E',
        statusBarContent: 'dark',
        navigationBarColor: '#0D0D0E',
        navigationBarContent: 'dark',
      },
    });

    // Check whether we are in a PWA standalone app
    if (window.navigator && !window.localStorage.getItem("tempo-override-pwa-detection") && !Capacitor.isNativePlatform()) setIsInMobileBrowser(!((("standalone" in window.navigator) && window.navigator.standalone) || window.matchMedia("(display-mode: standalone)").matches));
    else if (window.localStorage.getItem("tempo-override-pwa-detection")) setIsInMobileBrowser(false);
    else setIsInMobileBrowser(!Capacitor.isNativePlatform())
  }, []);

  useEffect(() => {
    setDisplayUI(true);
    
    if (isInMobileBrowser)
      return;

    // Instantiate a user handler for this session
    const user = new User();

    // Handler for subscribing to push notifications
    const onSubmitSubscribe = async () => {
      // TODO: Figure out how to setup notifications on native app
      if (Capacitor.isNativePlatform())
        return;

      if (!user.isLoggedIn) {
        console.error("Attempted to subscribe to notifications without being authorised");
        
        return;
      }

      // Files the subscription with the server, under a device id that is kept
      // so this is idempotent — re-running it overwrites the same record rather
      // than leaving a trail of one per app start.
      //
      // The response is checked. fetch only rejects on a network failure, so a
      // 403 or a 500 here used to be logged and stepped straight over, leaving
      // the browser holding a subscription the server had never heard of — and
      // since the key still matched, nothing downstream ever retried it.
      const registerSubscription = async (subscription: PushSubscription) => {
        const subId = window.localStorage.getItem(NOTIF_SUB_ID_KEY) ?? randomBytes(8).toString("hex");

        const res = await fetch(API_URL + "/notify/subscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(user.getAuthHeaders()),
          },
          credentials: "include",
          body: JSON.stringify({
            id: `${user.id}-${subId}`,
            subscription: subscription.toJSON()
          }),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");

          throw new Error(`Failed to register push subscription (${res.status}) ${detail}`);
        }

        window.localStorage.setItem(NOTIF_SUB_ID_KEY, subId);

        console.log("Registered notification handler with id:", subId);
      };

      // Devices subscribed under an older VAPID key hold an endpoint the push
      // service will never accept again, and nothing about that is visible to
      // the user — the app looks subscribed and simply receives nothing. This
      // drops the dead subscription and clears the flag below, so the prompt
      // runs again and a fresh subscription is made against the current key.
      await resetStaleSubscription();

      if (window.localStorage.getItem(NOTIF_PROCESSED_KEY)) {
        // Already opted in — but the browser holding a subscription says nothing
        // about whether the server still has it. The registration can fail, and
        // the volume it is stored on can be replaced. Re-filing it on each start
        // is the only way this device finds out, and costs one small request.
        try {
          const registration = ('serviceWorker' in navigator ? await navigator.serviceWorker.ready : null);
          const existing = await registration?.pushManager?.getSubscription();

          if (existing)
            await registerSubscription(existing);
        } catch (e) {
          console.warn("Could not re-register the existing push subscription:", e);
        }

        return;
      }

      const localAllow = await new Promise<boolean>(resolve => {
        triggerModal("Notifications", (<>
          <Text>
            Would you like to receive notifications from Tempo?
          </Text>
          <br />
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

      window.localStorage.setItem(NOTIF_PROCESSED_KEY, "true");
      onModalClose();

      if (!localAllow) {
        window.localStorage.setItem(NOTIF_PROCESSED_KEY, "true");

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

        // Authenticated: the server files the subscription against the token's
        // user, so an unauthenticated call would be rejected outright
        await registerSubscription(subscription);
      } catch (e) {
        // Log a warning in case of an error
        console.warn(e);

        try { window.localStorage.removeItem(NOTIF_PROCESSED_KEY); } catch { }
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

      setTimeout(() => {
        SplashScreen.hide();
      }, 250);
      
      if (page) setPage(page);
    });

    prouter.initRouter();

    user.on("performance-message", (msg: string) => {
      setPerfMsg(msg);
    });

    user.on("user-init", async () => {
      console.log("User object has been updated! User object:", user);

      setPerfMsg(undefined);

      // TODO: Re-enable this when singup flow has been made
      // prouter.setPage(user.isLoggedIn ? "app" : "signup");

      if (!user.isLoggedIn && !user.authError) {
        if (!Capacitor.isNativePlatform()) {
          window.location.href = API_URL + "/auth/ui";
        } else {
          const seshReq = await fetch(API_URL + "/createTokenSwapSession");
          const seshRes = await seshReq.json() as {
            error: boolean;
            token: string;
          }

          if (seshRes.error) {
            console.error("Failed to create token swap session, response:", seshRes);
            return;
          }

          console.log(seshRes)

          const loadSwappedToken = async () => {
            const req = await fetch(API_URL + "/swapToken/" + seshRes.token);
            const res = await req.json() as {
              error: boolean;
              message: string;
              swap?: ("INIT" | "ERR" | string);
            };

            if (res.swap == "INIT") {
              console.warn("Attempted to get swapped token but it is still initialising server-side, res:", res);
              return "INIT";
            } else if (res.swap == "ERR") {
              console.warn("Failed to swap auth token as server returned an error state, res:", res);
            } else if (res.error || !res.swap) {
              console.warn("Unknown error while swapping auth token, res:", res);
            } else if (res.swap) {
              console.log("Got swapped token:", res.swap);

              await Preferences.set({
                key: "tempo.s.a",
                value: res.swap,
              });

              return res.swap;
            }
          }

          const swapTokenSock = new WebSocket(API_URL_SOCK + "/awaitTokenSwapSession/" + seshRes.token);

          swapTokenSock.onopen = () => {
            swapTokenSock.send("READY");
          }

          swapTokenSock.onerror = e => {
            console.error("Token swap socket error:", e.toString());
          }

          let checker: NodeJS.Timeout | undefined;

          swapTokenSock.onmessage = async m => {
            console.log(m.data);

            const data = JSON.parse(m.data) as {
              error: boolean;
              message?: string;
              flag: "CALLED" | "READY";
            };

            if (data.error) {
              console.error("Unable to create swap token session complete callback, res:", data);

              return;
            }

            if (data.flag == "READY") {
              InAppBrowser.openInSystemBrowser({
                url: API_URL + "/auth/app/" + seshRes.token,
                options: {
                  ...DefaultSystemBrowserOptions,
                  iOS: {
                    ...DefaultiOSSystemBrowserOptions,
                    closeButtonText: DismissStyle.DONE,
                    viewStyle: iOSViewStyle.PAGE_SHEET,
                  },
                  android: {
                    ...DefaultAndroidSystemBrowserOptions,
                    viewStyle: AndroidViewStyle.BOTTOM_SHEET,
                  },
                }
              });

              checker = setInterval(async () => {
                const tok = await loadSwappedToken();

                console.log("POLL:", tok)
      
                if (tok && tok !== "INIT") {
                  try {
                    InAppBrowser.close();
                  } catch { }

                  clearInterval(checker);
                  prepare(tok);
                }
              }, 2500);
            } else if (data.flag == "CALLED") {
              try {
                InAppBrowser.close();
              } catch { }

              const tok = await loadSwappedToken();

              prepare(tok);
            }
          }

          swapTokenSock.onclose = () => {
            console.log("Token swap socket has been closed");
          }
        }
      } else if (user.authError) {
        Preferences.remove({
          key: "tempo.s.a"
        });

        setPerfMsg("Sorry, Tempo is not available right now, please try again later");
      } else {
        // User is logged in, we can start the app
        window.history.pushState(null, document.title, location.href);
        window.addEventListener('popstate', () => {
          history.pushState(null, document.title, location.href);
        });

        if (!window.localStorage.getItem("tempo-legal-agreed")) {
          prouter.setPage("legal");
          return;
        }

        onSubmitSubscribe()
        .then(() => {
          const showWelcomeMsg = () => {
            return new Promise<void>((resolve) => {
              if (window.localStorage.getItem("tempo-dev-warning-msg")) {
                resolve();
                return;
              }
              
              triggerModal("Hi there! 👋", (<>
                <Text>
                  Thank you for supporting Tempo.
                  <br />
                  <br />
                  We are currently undergoing rapid application development and as such, the application may not be entirely stable. You may experience unexpected behaviours and weird bugs as development progresses.
                  <br />
                  <br />
                  Please report any bugs as you encounter them (and feature requests) to help build Tempo.
                  <br />
                  <br />
                  Thank you for your understanding!
                </Text>
              </>), {
                text: "Got it!",
                callback() {
                  window.localStorage.setItem("tempo-dev-warning-msg", "true");
                  onModalClose();
                  resolve();
                },
              });
            });
          };

          const showUpdateMsg = () => {
            return new Promise<void>(async (resolve) => {
              const localVersion = parseInt(window.localStorage.getItem("tempo-local-version") ?? "-1");
              const localVersionNotice = parseInt(window.localStorage.getItem("tempo-local-version-notice") ?? "-1");
              
              try {
                const req = await fetch(API_URL + "/.version");
                const remoteVersion = parseInt(await req.text());

                if (!isNaN(remoteVersion) && (isNaN(localVersion) || localVersion < remoteVersion)) {
                  // Client version is out of date, force ui to refresh
                  window.localStorage.setItem("tempo-local-version", remoteVersion.toString())

                  if (!isNaN(localVersion) && localVersion !== -1)
                    window.location.reload();
                  else
                    window.localStorage.setItem("tempo-local-version-notice", remoteVersion.toString())

                  return resolve();
                } else if (localVersion === remoteVersion && localVersionNotice < remoteVersion) {
                  const req = await fetch(API_URL + "/.version-notice");
                  const notice = (await req.json()) as {
                    title: string;
                    text: string[];
                    primaryButtonText?: string;
                    secondaryButtonText?: string;
                    secondaryButtonPage?: string;
                  };

                  triggerModal(notice.title, (<>
                    <Text>
                      {notice.text.map((v, i) => {
                        if (v == "")
                          return (<br />);

                        return (<>
                          {i !== 0 && (<br />)}
                          {v}
                        </>);
                      })}
                    </Text>
                  </>), {
                    text: notice.primaryButtonText ?? "Got it!",
                    callback() {
                      window.localStorage.setItem("tempo-local-version-notice", remoteVersion.toString());
                      onModalClose();
                      resolve();
                    },
                  }, {
                    text: notice.secondaryButtonText,
                    callback() {
                      window.localStorage.setItem("tempo-local-version-notice", remoteVersion.toString());
                      
                      if (notice.secondaryButtonPage)
                        prouter.setMainUIPage(notice.secondaryButtonPage);
                      
                      onModalClose();
                      resolve();
                    },
                  });
                }
              } catch (ex) {
                console.error("Failed to check application version, error:", ex);

                resolve();
              }
            });
          };

          console.log("ns1 cb")

          showUpdateMsg()
          .then(showWelcomeMsg);
        });

        // TODO: Check if the timestamp stored here is newer than the last t&c or privacy policy update date
        if (window.localStorage.getItem("tempo-legal-agreed") !== null)
          prouter.setPage("app");
        else
          prouter.setPage("legal");
      }
    });

    const prepare = async (stok?: string) => {
      let storedToken = undefined;

      console.log("STOK:", stok);
    
      if (Capacitor.isNativePlatform()) {
        if (stok) {
          await Preferences.set({
            key: "tempo.s.a",
            value: stok
          });
        }

        try {
          const tok = await Preferences.get({
            key: "tempo.s.a",
          });

          if (tok)
            storedToken = tok.value ?? undefined;
        } catch { /* no-op */ }
      }

      // Wait for the user handler to finish initialising
      user.init(stok ?? storedToken)
      .then(() => {
        console.log("User handler has been initialised!");
      });
    }

    prepare();
  }, [isInMobileBrowser]);

  function triggerInstallPWA() {
    deferredPWAInstaller.prompt();
  }

  return (<div style={{
    opacity: displayUI ? "1" : "0",
    pointerEvents: displayUI ? "all" : "none",
    overflowY: displayUI ? "auto" : "hidden",
    height: "100%",
    width: "100%",
  }}>
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
    <Box background="#0D0D0E" height="100%" width="100%" overflow="auto" data-profile-scroll-container>
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
                src="/icons/ui/logo-clear.svg"
                alt="Tempo logo"
                width="88px"
                height="88px"
                marginBottom="16px"
                userSelect="none"
                loading="lazy"
              />
              <Box>
                <Text fontFamily="Inter" fontSize="20px">{!hasPreviouslyBeenOpened ? "Welcome to " : "Welcome back to "}<b>Tempo</b>!</Text>
                <Box overflow="auto">
                  <Stack gap="20px">
                    {Capacitor.isNativePlatform()}
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
                <Image width="100px" height="110px" src="/icons/ui/logo-clear.svg" loading="lazy" />
              </Center>
              <Text
                fontFamily="arial, helvetica"
                fontSize="20px"
                width="100%"
                textAlign="center"
                opacity="0.85"
              >{perfMsg}</Text>
            </Stack>
            <Box pos="absolute" bottom="20px" left="0" right="0" margin="auto" width="220px" padding="4px" paddingLeft="6px" background="rgba(255, 255, 255, 0.075)" border="2px solid rgba(255, 255, 255, 0.05)" borderRadius="30px">
              <iframe src="https://status.tempo-music.co/badge?theme=dark" width="220" height="30" style={{
                background: "transparent",
                colorScheme: "normal",
              }} />
            </Box>
          </Center>
      </>)}
    </Box>
  </div>);
}
