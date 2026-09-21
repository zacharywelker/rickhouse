import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone for the slim runtime image (see Dockerfile).
  output: "standalone",
  typedRoutes: true,
  experimental: {
    // Uploads can be large; server actions need headroom for M3 image upload.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
