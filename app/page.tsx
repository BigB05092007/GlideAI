"use client";

import dynamic from "next/dynamic";
import { Waves } from "lucide-react";

const AnalysisEngine = dynamic(
  () => import("@/components/AnalysisEngine"),
  { ssr: false }
);

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-glide-border bg-glide-dark/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Waves className="w-7 h-7 text-cyan-400" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Glide<span className="text-cyan-400">AI</span>
            </h1>
            <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500">
              Aquatic Intelligence
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Live Analysis
        </div>
      </header>

      {/* Main Analysis Area */}
      <section className="flex-1 min-h-0 p-4 lg:p-6">
        <AnalysisEngine />
      </section>

      {/* Footer */}
      <footer className="px-8 py-3 border-t border-glide-border text-center text-xs text-gray-600">
        GlideAI v1.0.0-Beta &middot; 100% On-Device Processing &middot; Zero Data Upload
      </footer>
    </main>
  );
}
