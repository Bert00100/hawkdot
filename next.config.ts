import type { NextConfig } from "next";
import { env } from "@/config/env";

const nextConfig: NextConfig = {
  distDir: env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@prisma/client", "jose"],
};

export default nextConfig;
