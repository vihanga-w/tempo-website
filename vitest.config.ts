import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
    // The app is compiled by Next, which injects the JSX runtime; vitest has to
    // be told separately or every .tsx test fails on "React is not defined"
    esbuild: { jsx: "automatic" },
    resolve: {
        // The same "@/..." the app is written against, so tests import modules
        // by the path the code under test uses rather than a relative one
        alias: { "@": resolve(__dirname, "src") },
    },
    test: {
        // jsdom for the component tests. The pure modules do not need it, and
        // one of them is specifically tested for working without a document —
        // see colour-blob.test.ts, which clears it for that case.
        environment: "jsdom",
        include: ["src/**/*.test.{ts,tsx}"],
    },
});
