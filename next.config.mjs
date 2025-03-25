/** @type {import('next').NextConfig} */

import npwa from "next-pwa";

const withPWA = npwa({
  dest: "public",
  register: true,
  skipWaiting: true,
});

const nextConfig = withPWA({
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
