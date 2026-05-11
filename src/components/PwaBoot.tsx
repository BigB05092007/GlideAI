"use client";

import { useEffect } from "react";

export default function PwaBoot() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const canRegister =
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (!canRegister) return;

    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {
      /* PWA caching is optional; camera analysis still works without it. */
    });
  }, []);

  return null;
}
