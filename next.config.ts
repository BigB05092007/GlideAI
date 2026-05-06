import type { NextConfig } from "next";

const isElectronExport = process.env.ELECTRON_BUILD === "1";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  ...(isElectronExport
    ? {
        output: "export" as const,
        assetPrefix: "./",
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
