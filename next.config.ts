import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone for the slim runtime image (see Dockerfile).
  output: "standalone",
  typedRoutes: true,
  experimental: {
    // Uploads can be large; server actions need headroom for M3 image upload.
    serverActions: { bodySizeLimit: "12mb" },
    // Separate from the limit above: this app has middleware on every route
    // (auth), and Next clones the request body for it in production. That
    // clone has its own size cap — distinct from serverActions.bodySizeLimit
    // — and in 15.5.x a request over it can come out the other side with an
    // empty body instead of an error, which is exactly the "No images were
    // selected" bug photo uploads hit. Match it to the server action limit.
    middlewareClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
