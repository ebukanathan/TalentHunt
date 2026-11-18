"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PublicFreshness() {
  const router = useRouter();
  useEffect(() => {
    let lastRefresh = 0;
    let historyTimer: ReturnType<typeof setTimeout>;
    function refresh() {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh < 1000) return;
      lastRefresh = Date.now();
      router.refresh();
    }
    function restored(event: PageTransitionEvent) { if (event.persisted) refresh(); }
    function historyChanged() { clearTimeout(historyTimer); historyTimer = setTimeout(refresh, 0); }
    const interval = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", restored);
    window.addEventListener("popstate", historyChanged);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      clearTimeout(historyTimer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", restored);
      window.removeEventListener("popstate", historyChanged);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return null;
}
