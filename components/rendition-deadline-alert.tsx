"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
  const popupShown = useRef(false);
  const closeMinutes = parseClock(closeTime);
  const pendingKey = agents.map((agent) => agent.id + ":" + agent.code).join("|");

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
    if (!shouldShow || popupShown.current) return;
    popupShown.current = true;
    const names = agents.map((agent) => (agent.kind === "subagent" ? "Subagente " : "Ambulante ") + agent.code + (agent.fullName ? " · " + agent.fullName : ""));
    window.alert(
      (minutesUntilClose !== null && minutesUntilClose > 0
        ? "Faltan " + minutesUntilClose + " minutos para el cierre."
        : "El horario de cierre ya llegó.") +
      "\n\nTodavía faltan rendiciones de:\n• " + names.join("\n• ")
    );
  }, [agents, minutesUntilClose, shouldShow, pendingKey]);

  if (!shouldShow || minutesUntilClose === null) return null;

  return (
    <section className="ticket-photo-deadline-alert" role="alert" aria-live="assertive">
      <h2>{minutesUntilClose > 0 ? "⚠️ Faltan " + minutesUntilClose + " min para el cierre" : "⚠️ Horario de cierre alcanzado"}</h2>
      <p>Estos operadores todavía no confirmaron su rendición diaria. Entrá desde el código para revisar y registrar la rendición pendiente.</p>
      <ul>
        {agents.map((agent) => (
          <li key={agent.id}>
            <strong>{agent.kind === "subagent" ? "Subagente" : "Ambulante"}</strong>
            <Link href={"/pagos?agent=" + encodeURIComponent(agent.id)}>{agent.code}</Link>
            {agent.fullName && <span>{agent.fullName}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
