"use client";

import { useEffect, useMemo, useState } from "react";
import { parseApiDate } from "@/lib/jalali-date";
import { toPersianDigits } from "@/lib/format";

function durationLabel(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.ceil(Math.abs(milliseconds) / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [
    days > 0 ? `${toPersianDigits(days)} روز` : null,
    hours > 0 ? `${toPersianDigits(hours)} ساعت` : null,
    days === 0 && minutes > 0 ? `${toPersianDigits(minutes)} دقیقه` : null,
  ].filter(Boolean);
  return parts.join(" و ") || "کمتر از یک دقیقه";
}

export function SlaCountdown({
  dueAt,
  state,
  paused = false,
  className,
}: {
  dueAt: string;
  state: string;
  paused?: boolean;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!["PENDING", "BREACHED", "PAUSED"].includes(state)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [state]);
  const due = useMemo(() => parseApiDate(dueAt)?.getTime() ?? null, [dueAt]);
  if (due === null) return <span className={className}>مهلت نامعتبر</span>;
  if (paused || state === "PAUSED") {
    return <span className={className}>زمان‌سنج متوقف است</span>;
  }
  if (!["PENDING", "BREACHED"].includes(state)) return null;
  const remaining = due - now;
  return (
    <span className={className}>
      {remaining >= 0
        ? `${durationLabel(remaining)} تا مهلت`
        : `${durationLabel(remaining)} از مهلت گذشته`}
    </span>
  );
}
