import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable image optimization warnings for demo
  images: { unoptimized: true },
};

export default nextConfig;
