"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { agencyBusinessDateForCutoff } from "@/lib/agency-datetime";
import { getAgencyLocalClock } from "@/lib/agency-draw-schedule";

export function DailyBoundaryRefresh({
  businessDate,
  cutoffTime,
  drawTimes = [],
}: {
  businessDate: string;
  cutoffTime: string;
  drawTimes?: string[];
}) {
  const router = useRouter();
  const boundaryKey = drawTimes.slice().sort().join(",");

  useEffect(() => {
    let lastSignature = "";
    const checkBoundary = () => {
      const now = new Date();
      const nextBusinessDate = agencyBusinessDateForCutoff(cutoffTime, now);
      const clock = getAgencyLocalClock(now);
      const passed = clock.date > businessDate
        ? boundaryKey
        : clock.date < businessDate
          ? ""
          : drawTimes
              .filter((time) => clock.minutes >= Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)))
              .slice()
              .sort()
              .join(",");
      const signature = clock.date + "|" + nextBusinessDate + "|" + passed;

      if (lastSignature && signature !== lastSignature) {
        lastSignature = signature;
        router.refresh();
        return;
      }
      lastSignature = signature;
    };

    const timer = window.setInterval(checkBoundary, 20_000);
    checkBoundary();
    return () => window.clearInterval(timer);
  }, [businessDate, cutoffTime, boundaryKey, drawTimes, router]);

  return null;
}
