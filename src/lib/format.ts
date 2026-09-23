import {
  formatJalaliDate,
  formatJalaliDateTime,
  parseApiDate,
  toPersianDateDigits,
} from "@/lib/jalali-date";

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  const date = parseApiDate(dateString);
  return date ? toPersianDateDigits(formatJalaliDate(date)) : "—";
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  const date = parseApiDate(dateString);
  return date ? toPersianDateDigits(formatJalaliDateTime(date)) : "—";
}

export function formatRelativeTime(dateString: string): string {
  const date = parseApiDate(dateString);
  if (!date) return "—";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "همین الان";
  if (minutes < 60) return `${toPersianDigits(minutes)} دقیقه پیش`;
  if (hours < 24) return `${toPersianDigits(hours)} ساعت پیش`;
  return `${toPersianDigits(days)} روز پیش`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${toPersianDigits((bytes / 1024).toFixed(1))} کیلوبایت`;
  return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}

export function toPersianDigits(input: string | number): string {
  return toPersianDateDigits(String(input));
}
