"use client";

import { useEffect } from "react";

const REVEAL_SELECTOR = "[data-nayori-reveal]";

export default function LandingMotionController() {
  useEffect(() => {
    const root = document.documentElement;
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR),
    );

    if (elements.length === 0) return;

    const showAll = () => {
      elements.forEach((element) => {
        element.dataset.nayoriVisible = "true";
      });
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (reducedMotion.matches || !("IntersectionObserver" in window)) {
      showAll();
      return;
    }

    root.classList.add("nayori-motion-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const element = entry.target as HTMLElement;
          element.dataset.nayoriVisible = "true";
          observer.unobserve(element);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );

    elements.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      root.classList.remove("nayori-motion-ready");
    };
  }, []);

  return null;
}
