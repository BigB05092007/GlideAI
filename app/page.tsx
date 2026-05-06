"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LogOut, Waves } from "lucide-react";

const AnalysisEngine = dynamic(
  () => import("@/components/AnalysisEngine"),
  { ssr: false }
);

async function quitApp() {
  if (typeof window === "undefined") return;
  if (window.glideApp?.quit) {
    await window.glideApp.quit();
    return;
  }
  const isElectron = /Electron/i.test(window.navigator.userAgent);
  if (isElectron) {
    window.location.href = "about:blank";
    return;
  }
  window.close();
}

export default function Home() {
  const [canQuitApp, setCanQuitApp] = useState(false);

  useEffect(() => {
    const isElectron =
      typeof window !== "undefined" &&
      (Boolean(window.glideApp?.quit) || /Electron/i.test(window.navigator.userAgent));

    setCanQuitApp(isElectron);
  }, []);

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 px-4 py-3 border-b border-glide-border bg-glide-dark/80 backdrop-blur-md sticky top-0 z-50 sm:px-8 sm:py-4">
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
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Analysis
          </div>
          {canQuitApp && (
            <button
              type="button"
              onClick={quitApp}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-400 transition hover:bg-red-500/20 hover:border-red-400/70"
            >
              <LogOut className="w-4 h-4" />
              Quit
            </button>
          )}
        </div>
      </header>

      {/* Main Analysis Area */}
      <section className="flex-1 min-h-0 p-2 sm:p-4 lg:p-6">
        <AnalysisEngine />
      </section>

      {/* Footer */}
      <footer className="px-4 py-3 border-t border-glide-border text-center text-xs text-gray-600 sm:px-8">
        GlideAI v1.0.0-Beta &middot; 100% On-Device Processing &middot; Zero Data Upload
      </footer>
    </main>
  );
}
