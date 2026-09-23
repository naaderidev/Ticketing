import DateObject from "react-date-object";
import gregorian from "react-date-object/calendars/gregorian";
import persian from "react-date-object/calendars/persian";
import gregorianEn from "react-date-object/locales/gregorian_en";
import persianEn from "react-date-object/locales/persian_en";

export const APPLICATION_TIME_ZONE = "Asia/Tehran";
export const JALALI_DATE_FORMAT = "YYYY/MM/DD";
export const JALALI_DATE_TIME_FORMAT = "YYYY/MM/DD HH:mm:ss";

const JALALI_DATE_TIME_PATTERN =
  /^(\d{4})[/-](\d{2})[/-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

type GregorianParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const tehranDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APPLICATION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function toEnglishDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function toPersianDateDigits(value: string): string {
  return value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

function tehranGregorianParts(date: Date): GregorianParts {
  const parts = new Map(
    tehranDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: parts.get("year")!,
    month: parts.get("month")!,
    day: parts.get("day")!,
    hour: parts.get("hour")!,
    minute: parts.get("minute")!,
    second: parts.get("second")!,
  };
}

function sameParts(left: GregorianParts, right: GregorianParts): boolean {
  return Object.keys(left).every(
    (key) => left[key as keyof GregorianParts] === right[key as keyof GregorianParts]
  );
}

function tehranLocalTimeToUtc(parts: GregorianParts): Date {
  const desiredAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  let timestamp = desiredAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = tehranGregorianParts(new Date(timestamp));
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    );
    timestamp += desiredAsUtc - observedAsUtc;
  }
  const result = new Date(timestamp);
  if (!sameParts(tehranGregorianParts(result), parts)) {
    throw new RangeError("زمان محلی انتخاب‌شده در منطقه زمانی تهران معتبر نیست");
  }
  return result;
}

function jalaliMatch(value: string): RegExpMatchArray | null {
  return toEnglishDigits(value.trim()).match(JALALI_DATE_TIME_PATTERN);
}

export function normalizeJalaliDate(value: string): string | null {
  const match = jalaliMatch(value);
  if (!match || match[4] !== undefined) return null;
  const parsed = parseJalaliDateTime(value);
  return parsed ? formatJalaliDate(parsed) : null;
}

export function shiftJalaliDate(value: string, days: number): string {
  const normalized = normalizeJalaliDate(value);
  if (!normalized) throw new RangeError("تاریخ شمسی معتبر نیست");
  return new DateObject({
    date: normalized,
    format: JALALI_DATE_FORMAT,
    calendar: persian,
    locale: persianEn,
  })
    .add(days, "day")
    .format(JALALI_DATE_FORMAT);
}

export function parseJalaliDateTime(value: string): Date | null {
  const match = jalaliMatch(value);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const numericYear = Number(year);
  if (numericYear < 1200 || numericYear > 1600) return null;
  const jalali = new DateObject({
    year: numericYear,
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    calendar: persian,
    locale: persianEn,
  });
  if (!jalali.isValid) return null;
  const converted = jalali.convert(gregorian, gregorianEn);
  try {
    const result = tehranLocalTimeToUtc({
      year: converted.year,
      month: converted.month.number,
      day: converted.day,
      hour: converted.hour,
      minute: converted.minute,
      second: converted.second,
    });
    const normalizedInput = `${year}/${month}/${day} ${hour}:${minute}:${second}`;
    return formatJalaliDateTime(result) === normalizedInput ? result : null;
  } catch {
    return null;
  }
}

export function parseJalaliDateEnd(value: string): Date | null {
  const normalized = normalizeJalaliDate(value);
  if (!normalized) return null;
  const nextDay = new DateObject({
    date: normalized,
    format: JALALI_DATE_FORMAT,
    calendar: persian,
    locale: persianEn,
  })
    .add(1, "day")
    .format(JALALI_DATE_FORMAT);
  const nextStart = parseJalaliDateTime(nextDay);
  return nextStart ? new Date(nextStart.getTime() - 1) : null;
}

function jalaliDateObject(date: Date): DateObject {
  const parts = tehranGregorianParts(date);
  return new DateObject({
    ...parts,
    calendar: gregorian,
    locale: gregorianEn,
  }).convert(persian, persianEn);
}

export function formatJalaliDate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("تاریخ معتبر نیست");
  return jalaliDateObject(date).format(JALALI_DATE_FORMAT);
}

export function formatJalaliDateTime(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("تاریخ معتبر نیست");
  return jalaliDateObject(date).format(JALALI_DATE_TIME_FORMAT);
}

export function parseApiDateTimeInput(value: string): Date | null {
  const jalali = parseJalaliDateTime(value);
  if (jalali) return jalali;
  if (!ISO_DATE_TIME_PATTERN.test(value)) return null;
  const isoDate = new Date(value);
  return Number.isNaN(isoDate.getTime()) ? null : isoDate;
}

export function parseApiDate(value: string): Date | null {
  const dateTime = parseApiDateTimeInput(value);
  if (dateTime) return dateTime;
  if (!ISO_DATE_PATTERN.test(value)) return null;
  const isoDate = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(isoDate.getTime()) ? null : isoDate;
}

function gregorianDateStringToJalali(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new DateObject({
    year,
    month,
    day,
    calendar: gregorian,
    locale: gregorianEn,
  })
    .convert(persian, persianEn)
    .format(JALALI_DATE_FORMAT);
}

function convertApiDateString(value: string): string {
  if (ISO_DATE_PATTERN.test(value)) return gregorianDateStringToJalali(value);
  if (ISO_DATE_TIME_PATTERN.test(value)) return formatJalaliDateTime(value);
  return value;
}

export function toJalaliApiPayload(value: unknown): unknown {
  if (value instanceof Date) return formatJalaliDateTime(value);
  if (typeof value === "string") return convertApiDateString(value);
  if (Array.isArray(value)) return value.map(toJalaliApiPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toJalaliApiPayload(item)])
    );
  }
  return value;
}
