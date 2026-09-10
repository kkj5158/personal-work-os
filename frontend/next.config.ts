import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow isolated local QA servers without competing for another dev server's lock.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
