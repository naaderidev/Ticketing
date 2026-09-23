import type { SlaClockType } from "@prisma/client";

const MINUTE_MS = 60_000;
const DAY_NAMES = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

type DayName = (typeof DAY_NAMES)[number];
type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type SlaWorkInterval = { start: string; end: string };
export type SlaWeeklySchedule = Record<DayName, SlaWorkInterval[]>;
export type SlaCalendarDefinition = {
  timeZone: string;
  weeklySchedule: SlaWeeklySchedule;
  holidayDateKeys: ReadonlySet<string>;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = formatterCache.get(timeZone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-CA-u-ca-gregory-hc-h23", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function getZonedDateTime(date: Date, timeZone: string): LocalDateTime {
  const values = Object.fromEntries(
    getFormatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour === 24 ? 0 : values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function zonedDateTimeToUtc(
  local: LocalDateTime,
  timeZone: string
): Date {
  const desired = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second
  );
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = getZonedDateTime(new Date(candidate), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    );
    candidate += desired - observedAsUtc;
  }
  return new Date(candidate);
}

function localDateKey(local: Pick<LocalDateTime, "year" | "month" | "day">) {
  return `${String(local.year).padStart(4, "0")}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
}

function localDayName(local: Pick<LocalDateTime, "year" | "month" | "day">) {
  return DAY_NAMES[
    new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay()
  ];
}

function addLocalDays(
  local: Pick<LocalDateTime, "year" | "month" | "day">,
  days: number
): Pick<LocalDateTime, "year" | "month" | "day"> {
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function timeParts(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function intervalBounds(
  local: Pick<LocalDateTime, "year" | "month" | "day">,
  interval: SlaWorkInterval,
  timeZone: string
) {
  const start = timeParts(interval.start);
  const end = timeParts(interval.end);
  return {
    start: zonedDateTimeToUtc(
      { ...local, ...start, second: 0 },
      timeZone
    ),
    end: zonedDateTimeToUtc({ ...local, ...end, second: 0 }, timeZone),
  };
}

function assertValidTimeZone(timeZone: string): void {
  try {
    getFormatter(timeZone).format(new Date(0));
  } catch {
    throw new Error("SLA calendar contains an invalid IANA time zone");
  }
}

export function parseWeeklySchedule(value: unknown): SlaWeeklySchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("SLA weekly schedule must be an object");
  }
  const source = value as Record<string, unknown>;
  const schedule = {} as SlaWeeklySchedule;
  for (const day of DAY_NAMES) {
    const intervals = source[day];
    if (!Array.isArray(intervals)) {
      throw new Error(`SLA weekly schedule is missing ${day}`);
    }
    schedule[day] = intervals.map((interval) => {
      if (!interval || typeof interval !== "object" || Array.isArray(interval)) {
        throw new Error(`SLA ${day} interval is invalid`);
      }
      const { start, end } = interval as Record<string, unknown>;
      if (
        typeof start !== "string" ||
        typeof end !== "string" ||
        !TIME_PATTERN.test(start) ||
        !TIME_PATTERN.test(end) ||
        start >= end
      ) {
        throw new Error(`SLA ${day} interval has invalid bounds`);
      }
      return { start, end };
    });
    for (let index = 1; index < schedule[day].length; index += 1) {
      if (schedule[day][index - 1].end > schedule[day][index].start) {
        throw new Error(`SLA ${day} intervals overlap or are not sorted`);
      }
    }
  }
  return schedule;
}

export function addBusinessDays(
  startedAt: Date,
  businessDays: number,
  calendar: SlaCalendarDefinition
): Date {
  if (!Number.isSafeInteger(businessDays) || businessDays <= 0) {
    throw new Error("Business-day duration must be a positive integer");
  }
  validateCalendar(calendar);
  const startedLocal = getZonedDateTime(startedAt, calendar.timeZone);
  let cursor = { year: startedLocal.year, month: startedLocal.month, day: startedLocal.day };
  let remaining = businessDays;
  for (let inspectedDays = 0; inspectedDays < 4000; inspectedDays += 1) {
    cursor = addLocalDays(cursor, 1);
    const isWorkingDay =
      calendar.weeklySchedule[localDayName(cursor)].length > 0 &&
      !calendar.holidayDateKeys.has(localDateKey(cursor));
    if (isWorkingDay) remaining -= 1;
    if (remaining === 0) {
      return zonedDateTimeToUtc(
        {
          ...cursor,
          hour: startedLocal.hour,
          minute: startedLocal.minute,
          second: startedLocal.second,
        },
        calendar.timeZone
      );
    }
  }
  throw new Error("Business-day calendar traversal exceeded the safety limit");
}

function validateCalendar(calendar: SlaCalendarDefinition): void {
  assertValidTimeZone(calendar.timeZone);
  parseWeeklySchedule(calendar.weeklySchedule);
  if (Object.values(calendar.weeklySchedule).every((day) => day.length === 0)) {
    throw new Error("SLA calendar must contain at least one working interval");
  }
}

export function addSlaDuration(
  startedAt: Date,
  durationMilliseconds: number,
  clockType: SlaClockType,
  calendar?: SlaCalendarDefinition | null
): Date {
  if (!Number.isFinite(durationMilliseconds) || durationMilliseconds < 0) {
    throw new Error("SLA duration must be a non-negative finite number");
  }
  if (clockType === "CALENDAR") {
    return new Date(startedAt.getTime() + durationMilliseconds);
  }
  if (!calendar) throw new Error("Business SLA requires a calendar snapshot");
  validateCalendar(calendar);

  let remaining = durationMilliseconds;
  let cursor = new Date(startedAt);
  for (let inspectedDays = 0; inspectedDays < 4000; inspectedDays += 1) {
    const local = getZonedDateTime(cursor, calendar.timeZone);
    if (!calendar.holidayDateKeys.has(localDateKey(local))) {
      for (const interval of calendar.weeklySchedule[localDayName(local)]) {
        const bounds = intervalBounds(local, interval, calendar.timeZone);
        const segmentStart = new Date(
          Math.max(cursor.getTime(), bounds.start.getTime())
        );
        if (segmentStart >= bounds.end) continue;
        const available = bounds.end.getTime() - segmentStart.getTime();
        if (remaining <= available) {
          return new Date(segmentStart.getTime() + remaining);
        }
        remaining -= available;
      }
    }
    const nextDay = addLocalDays(local, 1);
    cursor = zonedDateTimeToUtc(
      { ...nextDay, hour: 0, minute: 0, second: 0 },
      calendar.timeZone
    );
  }
  throw new Error("SLA calendar traversal exceeded the safety limit");
}

export function measureSlaDuration(
  startedAt: Date,
  endedAt: Date,
  clockType: SlaClockType,
  calendar?: SlaCalendarDefinition | null
): number {
  if (endedAt <= startedAt) return 0;
  if (clockType === "CALENDAR") return endedAt.getTime() - startedAt.getTime();
  if (!calendar) throw new Error("Business SLA requires a calendar snapshot");
  validateCalendar(calendar);

  let elapsed = 0;
  let cursor = new Date(startedAt);
  for (let inspectedDays = 0; inspectedDays < 4000 && cursor < endedAt; inspectedDays += 1) {
    const local = getZonedDateTime(cursor, calendar.timeZone);
    if (!calendar.holidayDateKeys.has(localDateKey(local))) {
      for (const interval of calendar.weeklySchedule[localDayName(local)]) {
        const bounds = intervalBounds(local, interval, calendar.timeZone);
        const segmentStart = Math.max(cursor.getTime(), bounds.start.getTime());
        const segmentEnd = Math.min(endedAt.getTime(), bounds.end.getTime());
        if (segmentEnd > segmentStart) elapsed += segmentEnd - segmentStart;
      }
    }
    const nextDay = addLocalDays(local, 1);
    cursor = zonedDateTimeToUtc(
      { ...nextDay, hour: 0, minute: 0, second: 0 },
      calendar.timeZone
    );
  }
  if (cursor < endedAt) {
    throw new Error("SLA calendar traversal exceeded the safety limit");
  }
  return elapsed;
}

export function calculateSlaMilestones(input: {
  startedAt: Date;
  targetMinutes: number;
  clockType: SlaClockType;
  calendar?: SlaCalendarDefinition | null;
  percentages: readonly number[];
}): Date[] {
  if (!Number.isInteger(input.targetMinutes) || input.targetMinutes <= 0) {
    throw new Error("SLA target minutes must be a positive integer");
  }
  return input.percentages.map((percentage) => {
    if (!Number.isFinite(percentage) || percentage <= 0) {
      throw new Error("SLA milestone percentage must be positive");
    }
    return addSlaDuration(
      input.startedAt,
      (input.targetMinutes * MINUTE_MS * percentage) / 100,
      input.clockType,
      input.calendar
    );
  });
}
