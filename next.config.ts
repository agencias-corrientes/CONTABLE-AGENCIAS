import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_ENV: process.env.VERCEL_ENV || "development",
  },
};

export default nextConfig;
