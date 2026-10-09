"use client";

import { useEffect } from "react";

export function RenditionScrollHelper() {
  useEffect(() => {
    const disclosures = Array.from(document.querySelectorAll<HTMLDetailsElement>("details.rendition-agent-accordion"));
    const scrollToCapture = (details: HTMLDetailsElement, behavior: ScrollBehavior) => {
      if (!details.open) return;
      const anchor = details.querySelector<HTMLElement>(".rendition-mode-switch") ?? details.querySelector<HTMLElement>(".rendition-entry-form");
      if (anchor) window.requestAnimationFrame(() => anchor.scrollIntoView({ behavior, block: "start" }));
    };
    const onToggle = (event: Event) => {
      const details = event.currentTarget as HTMLDetailsElement;
      if (!details.open) return;
      disclosures.forEach((other) => {
        if (other !== details && other.open) other.open = false;
      });
      scrollToCapture(details, "smooth");
    };
    disclosures.forEach((details) => details.addEventListener("toggle", onToggle));
    const initiallyOpen = disclosures.find((details) => details.open);
    if (initiallyOpen) scrollToCapture(initiallyOpen, "auto");
    return () => disclosures.forEach((details) => details.removeEventListener("toggle", onToggle));
  }, []);
  return null;
}
