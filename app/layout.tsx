import type { Metadata, Viewport } from "next";
import PwaBoot from "@/components/PwaBoot";
import "./globals.css";

export const metadata: Metadata = {
  title: "GlideAI - Aquatic Intelligence",
  description: "Institutional-grade swim biomechanics powered by on-device AI",
  manifest: "manifest.webmanifest",
  applicationName: "GlideAI",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GlideAI",
  },
  icons: {
    icon: "icon.svg",
    apple: "icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0f",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-glide-dark text-white antialiased">
        <PwaBoot />
        {children}
      </body>
    </html>
  );
}
