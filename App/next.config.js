/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained Node.js server for container and VPS deployments.
  output: "standalone",
  // Lint is decoupled from the production build; run `npm run lint` separately.
  eslint: { ignoreDuringBuilds: true },
  // This repository intentionally has separate lockfiles for contracts and the app.
  outputFileTracingRoot: __dirname,
  webpack: (config) => {
    // @stacks/connect pulls in WalletConnect/pino, which optionally requires
    // pino-pretty (and others) that aren't needed in the browser bundle.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
}

module.exports = nextConfig
