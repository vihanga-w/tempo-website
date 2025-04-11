'use client';

import { E404 } from "@/components/404";
import { EventEmitter } from "events";
import React from "react";
import { UIApp } from "@/components/app";
import User from "./usrlib";

const LSNavigationKey = "tempo-navigation";

export default class PageRouter extends EventEmitter {
    // private uplink: Uplink;
    private user: User;
    public connectionState: string;
    private mainUIPage: string;

    constructor(user: User) {
        super();

        // this.uplink = uplink;
        this.user = user;
        this.connectionState = "offline";
        this.mainUIPage = "activity";

        // uplink.on("classify-connection-state-change", d => {
        //     console.log("classify-connection-state-change ==>", d);
        //     this.connectionState = d;
        //     window.localStorage.setItem("m.iuid", d);
        //     this.emit("ccsc", d);
        // });

        if (!window.localStorage.getItem(LSNavigationKey)) {
            window.localStorage.setItem(LSNavigationKey, "signup");
        }
    }

    setPage(pageId: string) {
        window.localStorage.setItem(LSNavigationKey, pageId);

        this.navigate(pageId);
    }

    setMainUIPage(pageId: string) {
        this.mainUIPage = pageId;
    }

    initRouter() {
        this.navigate();
        this.emit("ready");
    }

    private navigate(pageId?: string) {
        const page = (pageId ?? window.localStorage.getItem(LSNavigationKey));

        console.log(page)

        switch (page) {
            // case "signup": {
            //     return this.emit("page-navigate", (<Signup uplink={this.uplink} prouter={this} flowCompleteCb={() => {
            //         this.user.init();
            //     }} />));
            // }
            case "app": {
                return this.emit("page-navigate", (<UIApp
                    prouter={this}
                    user={this.user}
                    currentPage={this.mainUIPage}
                    setCurrentPage={(p) => {
                        this.mainUIPage = p;
                    }}
                />))
            }
            default: {
                return this.emit("page-navigate", (<E404 />));
            }
        }
    }
}