"use client";

import { useEffect, useState } from "react";

type PendingAgent = {
  id: string;
  code: string;
  fullName: string;
  kind: "subagent" | "ambulant";
};

function buenosAiresMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function parseClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
}

export function RenditionDeadlineAlert({
  closeTime,
  agents,
}: {
  closeTime: string;
  agents: PendingAgent[];
}) {
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  const closeMinutes = parseClock(closeTime);

  useEffect(() => {
    const update = () => setNowMinutes(buenosAiresMinutes(new Date()));
    update();
    const timer = window.setInterval(update, 10_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const minutesUntilClose = closeMinutes !== null && nowMinutes !== null
    ? closeMinutes - nowMinutes
    : null;
  const shouldShow = agents.length > 0
    && minutesUntilClose !== null
    && minutesUntilClose <= 30
    && minutesUntilClose >= -120;

  useEffect(() => {
    const selector = ".agency-agent-code-button[data-agent-id]";
    document.querySelectorAll(selector).forEach((element) => {
      element.classList.remove("is-rendition-missing");
    });
    if (!shouldShow) return;
    const pendingIds = new Set(agents.map((agent) => agent.id));
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const agentId = element.dataset.agentId;
      if (agentId && pendingIds.has(agentId)) {
        element.classList.add("is-rendition-missing");
      }
    });
    return () => {
      document.querySelectorAll(selector).forEach((element) => {
        element.classList.remove("is-rendition-missing");
      });
    };
  }, [agents, shouldShow]);

  return null;
}
