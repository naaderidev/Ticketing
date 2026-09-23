import {
  normalizeJalaliDate,
  parseJalaliDateTime,
} from "@/lib/jalali-date";

export function jalaliToGregorian(jalaliDate: string): Date | null {
  return parseJalaliDateTime(jalaliDate);
}

export function normalizeJalaliDateInput(value: string): string | null {
  return normalizeJalaliDate(value);
}
