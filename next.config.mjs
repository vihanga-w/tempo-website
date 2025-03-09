/** @type {import('next').NextConfig} */

import { existsSync } from "fs";

const nextConfig = {
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
