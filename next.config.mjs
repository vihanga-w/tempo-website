/** @type {import('next').NextConfig} */

import { existsSync } from "fs";

const apiBase = "https://tempo.filmclick.eu.org";

const nextConfig = {
    // Rewrite the relative API paths to go to the hosted backend server
    async rewrites() {
        return [
            {
                source: '/api/public/sessions',
                destination: `${apiBase}/spotify/public/sessions`,
            },
            {
                source: '/api/sub/:userId',
                destination: `${apiBase}/spotify/stream/:userId`
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
