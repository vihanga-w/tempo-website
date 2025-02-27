/** @type {import('next').NextConfig} */

import { existsSync } from "fs";

// const isProd = false;
// const isLocal = true;
// const disableAPIBaseOverrides = false;

// const localApiBase = (
//     isLocal ? "http://localhost:9925" : "https://organic-space-robot-9j9v67x94ggfpxx6-9925.app.github.dev"
// );
// const apiBase = (
//     (!disableAPIBaseOverrides && existsSync(".fw-dev")) ? "https://mchat-api.filmclick.eu.org" : (
//         isProd ? "https://mchat-api.filmclick.eu.org" : localApiBase
//     )
// );

const apiBase = "http://localhost:9925";
// const apiBase = "https://mchat-api.filmclick.eu.org";
// const apiBase = "https://fuzzy-space-funicular-qpqrv7xqj9vfxq4v-9925.app.github.dev/";

const nextConfig = {
    // Rewrite the relative API paths to go to the hosted backend server
    async rewrites() {
        return [
            {
                source: '/api/ping',
                destination: `${apiBase}/ping`,
            },
            {
                source: '/api/professions',
                destination: `${apiBase}/professions-list`
            },
            {
                source: '/api/uplink-base',
                destination: `${apiBase}/uplink-base`,
            },
            {
                source: '/api/me',
                destination: `${apiBase}/me`,
            },
            {
                source: '/api/me/encryption-availability',
                destination: `${apiBase}/me/encryption-availability`,
            },
            {
                source: `/public/noprecache/icheck`,
                destination: "http://www.msftncsi.com/ncsi.txt",
            }
        ]
    },
    reactStrictMode: false,
};

import npwa from "next-pwa";

const withPWA = npwa({
    dest: 'public',
    register: true,
    skipWaiting: true,
})

export default withPWA(nextConfig);
