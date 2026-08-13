import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Default Server Action body limit (1MB) is too small for Media Library image uploads.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
