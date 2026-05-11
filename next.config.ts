import type { NextConfig } from "next";

const isElectronExport = process.env.ELECTRON_BUILD === "1";
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  ...(isElectronExport || isStaticExport
    ? {
        output: "export" as const,
        assetPrefix: "./",
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
