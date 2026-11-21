import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// On-device voice input (Brave, Firefox) runs Moonshine in `public/speech-worker.js`: the library
// (and its WebAssembly runtime) comes from jsDelivr, the model files from Hugging Face. Only
// downloads; audio never leaves the device.
const SPEECH_LIB = "https://cdn.jsdelivr.net";
const SPEECH_MODEL = "https://huggingface.co https://*.huggingface.co https://*.hf.co";

// Previous policy, before on-device voice input:
// "script-src 'self' 'unsafe-inline'" (+ 'unsafe-eval' in dev), "connect-src 'self'", "worker-src 'self'"
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${SPEECH_LIB}${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${SPEECH_LIB} ${SPEECH_MODEL}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // The end-to-end run builds into its own folder so it never disturbs a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Lets a phone or another computer on the same Wi-Fi open the dev server (http://<this-pc-ip>:3000).
  // Without this, Next blocks the scripts and live-reload socket it loads from any other address
  // and the page stays blank. Development only: it has no effect on a production build.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // The worker must always be revalidated so updates reach users promptly.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
