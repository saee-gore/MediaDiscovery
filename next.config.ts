import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Hides the floating Next.js dev-tools badge in the corner during `npm run dev`.
  devIndicators: false,
  serverExternalPackages: ["pg"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "image.tmdb.org" },
    ],
  },
  eslint: {
    // Lint runs as its own step (`npm run lint`); it should not fail a build.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
