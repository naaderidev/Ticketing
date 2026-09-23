import { z } from "zod";
import {
  normalizeJalaliDate,
  parseApiDateTimeInput,
} from "@/lib/jalali-date";

export function apiDateTimeSchema(message: string) {
  return z.string().trim().transform((value, context) => {
    const date = parseApiDateTimeInput(value);
    if (!date) {
      context.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return date;
  });
}

export function apiJalaliDateSchema(message: string) {
  return z.string().trim().transform((value, context) => {
    const normalized = normalizeJalaliDate(value);
    if (!normalized) {
      context.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return normalized;
  });
}
