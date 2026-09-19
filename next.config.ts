import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@prisma/client", "jose"],
};

export default nextConfig;
