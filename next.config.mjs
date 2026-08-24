/** @type {import('next').NextConfig} */

import npwa from "next-pwa";

const withPWA = npwa({
  dest: "public",
  register: true,
  skipWaiting: true,
  // Pulls the push handler into the generated worker.
  //
  // A scope holds exactly one service worker registration, and next-pwa
  // registers /sw.js at the root. Registering notify-sw.js separately did not
  // add a second worker, it fought over the same slot — and /sw.js won, so
  // every push arrived at a worker with no push listener and nothing was ever
  // displayed. Importing it means the worker that actually runs is the one that
  // knows what to do with a push.
  importScripts: ["/notify-sw.js"],
  // Kept out of the precache manifest because the static export never emits it.
  //
  // Workbox fetches every precached URL during install and a single 404 rejects
  // the whole install, so the worker never activates. next-pwa lists this file
  // for the App Router, Next does not write it under `output: "export"`, and the
  // result was a service worker that could not update: the one already installed
  // on a device kept running and every new version failed silently. That is why
  // a worker with no push handler survived being replaced.
  buildExcludes: [/app-build-manifest\.json$/],
});

/*
 * The colour and layout benches are development tooling, so they are only
 * treated as pages while developing.
 *
 * They used to build into the export like any other route, which put
 * /dev-preview, /dev-colour and /dev-blob on the public site — harnesses that
 * hang test hooks off `window` and exist to be poked at. Naming them
 * `page.dev.tsx` and only recognising that extension outside a production build
 * leaves those directories with no page file to compile, so the routes are not
 * emitted at all rather than shipped and hidden.
 */
const isProduction = process.env.NODE_ENV === "production";

const pageExtensions = ["tsx", "ts", "jsx", "js"];

const nextConfig = withPWA({
  pageExtensions: (isProduction ? pageExtensions : ["dev.tsx", ...pageExtensions]),
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  output: "export",
  webpack: (config) => {
    config.module.rules.push(
      {
        test: /\.glsl$/,
        use: ["webpack-glsl-loader"],
      },
      {
        test: /\.(glb|gltf)$/,
        type: "asset/resource", // Use Webpack's built-in asset/resource for handling binary files
        generator: {
          filename: "static/media/[name].[hash][ext]", // Ensure the output path is correct
        },
      }
    );

    // Add alias for "@"
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": "./src", // Ensure this alias points to the correct directory
    };

    return config;
  },
});

export default nextConfig;
