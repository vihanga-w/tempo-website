/** @type {import('next').NextConfig} */

import { existsSync } from "fs";

const nextConfig = {
    // Rewrite the relative API paths to go to the hosted backend server
    async rewrites() {
        return [
            {
                source: `/public/noprecache/icheck`,
                destination: "http://www.msftncsi.com/ncsi.txt",
            }
        ]
    },
    reactStrictMode: true,
    images: {
        unoptimized: true,
    },
    output: 'export',
};

import npwa from "next-pwa";

const withPWA = npwa({
    dest: 'public',
    register: true,
    skipWaiting: true,
})

export default withPWA(nextConfig);
