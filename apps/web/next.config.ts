import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cirofy/ui", "@cirofy/shared"],
  output: "standalone",
};

export default nextConfig;
