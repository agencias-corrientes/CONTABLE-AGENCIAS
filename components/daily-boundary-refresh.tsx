"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { agencyBusinessDateForCutoff } from "@/lib/agency-datetime";
import { getAgencyLocalClock } from "@/lib/agency-draw-schedule";

export function DailyBoundaryRefresh({
  businessDate,
  cutoffTime,
  drawTimes = [],
  renderedAt,
}: {
  businessDate: string;
  cutoffTime: string;
  drawTimes?: string[];
  renderedAt: string;
}) {
  const router = useRouter();
  // De-duplicate equal draw times (e.g. Nocturna and Poceada) and keep
  // a stable dependency so re-renders do not restart the timer needlessly.
  const boundaryKey = Array.from(new Set(drawTimes.filter(Boolean))).sort().join(",");

  useEffect(() => {
    const boundaryTimes = boundaryKey ? boundaryKey.split(",") : [];
    const signatureAt = (now: Date) => {
      const nextBusinessDate = agencyBusinessDateForCutoff(cutoffTime, now);
      const clock = getAgencyLocalClock(now);
      const passed = clock.date > businessDate
        ? boundaryKey
        : clock.date < businessDate
          ? ""
          : boundaryTimes
              .filter((time) => clock.minutes >= Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)))
              .join(",");
      return clock.date + "|" + nextBusinessDate + "|" + passed;
    };

    // Compare against the moment the page was rendered. If a draw boundary
    // passed during hydration, refresh immediately instead of missing it.
    const renderedDate = new Date(renderedAt);
    let lastSignature = signatureAt(Number.isNaN(renderedDate.getTime()) ? new Date() : renderedDate);

    const checkBoundary = () => {
      const signature = signatureAt(new Date());
      if (signature !== lastSignature) {
        lastSignature = signature;
        router.refresh();
      }
    };
    const refreshOnResume = () => {
      if (document.visibilityState === "visible") checkBoundary();
    };

    const timer = window.setInterval(checkBoundary, 10_000);
    window.addEventListener("focus", refreshOnResume);
    document.addEventListener("visibilitychange", refreshOnResume);
    window.addEventListener("pageshow", refreshOnResume);
    checkBoundary();

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshOnResume);
      document.removeEventListener("visibilitychange", refreshOnResume);
      window.removeEventListener("pageshow", refreshOnResume);
    };
  }, [businessDate, cutoffTime, boundaryKey, renderedAt, router]);

  return null;
}
