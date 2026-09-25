"use client";

import { useEffect, useState } from "react";

/** İlk boyama sonrası içerik iskeleti — sidebar layout’ta kalır, gecikme kısa tutulur. */
export function usePageReady(delayMs = 120) {
  const [ready, setReady] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setReady(true);
      return;
    }
    const id = window.setTimeout(() => setReady(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  return ready;
}
