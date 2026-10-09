"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { agencyBusinessDateForCutoff } from "@/lib/agency-datetime";

export function DailyBoundaryRefresh({
  businessDate,
  cutoffTime,
}: {
  businessDate: string;
  cutoffTime: string;
}) {
  const router = useRouter();

  useEffect(() => {
    let refreshed = false;
    const checkBoundary = () => {
      const nextBusinessDate = agencyBusinessDateForCutoff(cutoffTime, new Date());
      if (!refreshed && nextBusinessDate !== businessDate) {
        refreshed = true;
        router.refresh();
      }
    };
    const timer = window.setInterval(checkBoundary, 20_000);
    checkBoundary();
    return () => window.clearInterval(timer);
  }, [businessDate, cutoffTime, router]);

  return null;
}
