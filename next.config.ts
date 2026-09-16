import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@prisma/client"],
};

export default nextConfig;
