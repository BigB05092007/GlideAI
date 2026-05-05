import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GlideAI - Aquatic Intelligence",
  description: "Institutional-grade swim biomechanics powered by on-device AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-glide-dark text-white antialiased">
        {children}
      </body>
    </html>
  );
}
