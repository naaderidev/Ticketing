export const REPORTING_TIME_ZONE = "Asia/Tehran" as const;

const localDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORTING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const localDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORTING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parts(date: Date, formatter: Intl.DateTimeFormat) {
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

export function reportingLocalDate(date: Date): string {
  const value = parts(date, localDateFormatter);
  return `${value.year}-${value.month}-${value.day}`;
}

export function isReportingLocalMidnight(date: Date): boolean {
  const value = parts(date, localDateTimeFormatter);
  return value.hour === "00" && value.minute === "00" && value.second === "00";
}

export function nextCalendarDate(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function shiftCalendarDate(localDate: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new RangeError("Calendar shift must be an integer");
  const date = reportingDateColumn(localDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function reportingLocalDates(from: Date, to: Date): string[] {
  const dates: string[] = [];
  for (
    let cursor = reportingLocalDate(from);
    cursor < reportingLocalDate(to);
    cursor = nextCalendarDate(cursor)
  ) {
    dates.push(cursor);
  }
  return dates;
}

export function reportingDateColumn(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}

export function reportingMidnightInstant(localDate: string): Date {
  let instant = reportingDateColumn(localDate);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const value = parts(instant, localDateTimeFormatter);
    const representedAsUtc = Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day),
      Number(value.hour),
      Number(value.minute),
      Number(value.second)
    );
    const desiredAsUtc = Date.parse(`${localDate}T00:00:00.000Z`);
    instant = new Date(instant.getTime() + desiredAsUtc - representedAsUtc);
  }
  if (!isReportingLocalMidnight(instant) || reportingLocalDate(instant) !== localDate) {
    throw new RangeError(`Cannot resolve reporting midnight for ${localDate}`);
  }
  return instant;
}
