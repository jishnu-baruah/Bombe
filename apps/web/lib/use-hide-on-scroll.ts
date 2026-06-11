"use client";

import { useEffect, useState } from "react";

// Shared scroll-direction hook for the floating nav pills. Hides the pill when
// the user scrolls down (gets chrome out of the way on long data pages) and
// reveals it the instant they scroll back up. Always visible near the top.
//
// rAF-throttled: the scroll listener only flips a flag, the read+setState runs
// once per frame, so fast scrolling never thrashes the main thread (this is the
// "clunky" fix, not a behavioural one).
export function useHideOnScroll(threshold = 80): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      const delta = y - lastY;

      if (y < threshold) {
        setHidden(false); // never hide near the top of the page
      } else if (Math.abs(delta) > 6) {
        setHidden(delta > 0); // down → hide, up → show; ignore sub-pixel jitter
      }
      lastY = y;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return hidden;
}
