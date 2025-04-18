'use client';

import { E404 } from "@/components/404";
import { EventEmitter } from "events";
import React, { lazy, Suspense } from "react";
import User from "./usrlib";
import { SuspenseSpinner } from "@/components/app";

const LSNavigationKey = "tempo-navigation";

const LegalPage = lazy(() => import("@/components/legal"));
const UIApp = lazy(() => import("@/components/app"));

export default class PageRouter extends EventEmitter {
    // private uplink: Uplink;
    private user: User;
    public connectionState: string;

    constructor(user: User) {
        super();

        // this.uplink = uplink;
        this.user = user;
        this.connectionState = "offline";

        // uplink.on("classify-connection-state-change", d => {
        //     console.log("classify-connection-state-change ==>", d);
        //     this.connectionState = d;
        //     window.localStorage.setItem("m.iuid", d);
        //     this.emit("ccsc", d);
        // });

        if (!window.localStorage.getItem(LSNavigationKey)) {
            window.localStorage.setItem(LSNavigationKey, "legal");
        }
    }

    setPage(pageId: string) {
        window.localStorage.setItem(LSNavigationKey, pageId);

        this.navigate(pageId);
    }

    setMainUIPage(pageId: string) {
        this.emit("set-main-page", pageId);
    }

    initRouter() {
        this.navigate();
        this.emit("ready");
    }

    private navigate(pageId?: string) {
        const page = (pageId ?? "load");

        switch (page) {
            case "load": {
                return this.emit("page-navigate", (<SuspenseSpinner />));
            }
            case "legal": {
                return this.emit("page-navigate", (
                    <Suspense fallback={<SuspenseSpinner />}>
                        <LegalPage prouter={this} />
                    </Suspense>
                ));
            }
            case "app": {
                return this.emit("page-navigate", (
                    <Suspense fallback={<SuspenseSpinner />}>
                        <UIApp prouter={this} user={this.user} />
                    </Suspense>
                ));
            }
            default: {
                return this.emit("page-navigate", (<E404 />));
            }
        }
    }
}