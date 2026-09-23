import {
  addSlaDuration,
  addBusinessDays,
  calculateSlaMilestones,
  measureSlaDuration,
  parseWeeklySchedule,
  type SlaCalendarDefinition,
} from "@/modules/sla-routing/domain/sla-clock";

const weeklySchedule = parseWeeklySchedule({
  SATURDAY: [{ start: "08:00", end: "17:00" }],
  SUNDAY: [{ start: "08:00", end: "17:00" }],
  MONDAY: [{ start: "08:00", end: "17:00" }],
  TUESDAY: [{ start: "08:00", end: "17:00" }],
  WEDNESDAY: [{ start: "08:00", end: "17:00" }],
  THURSDAY: [],
  FRIDAY: [],
});

function calendar(holidays: string[] = []): SlaCalendarDefinition {
  return {
    timeZone: "Asia/Tehran",
    weeklySchedule,
    holidayDateKeys: new Set(holidays),
  };
}

describe("SLA clock", () => {
  it("adds calendar time without applying the work calendar", () => {
    expect(
      addSlaDuration(
        new Date("2026-09-11T20:00:00.000Z"),
        15 * 60_000,
        "CALENDAR"
      ).toISOString()
    ).toBe("2026-09-11T20:15:00.000Z");
  });

  it("adds business time inside a Tehran work day", () => {
    expect(
      addSlaDuration(
        new Date("2026-09-12T07:00:00.000Z"),
        2 * 60 * 60_000,
        "BUSINESS",
        calendar()
      ).toISOString()
    ).toBe("2026-09-12T09:00:00.000Z");
  });

  it("skips Thursday, Friday and configured holidays", () => {
    const start = new Date("2026-09-09T12:30:00.000Z");
    expect(
      addSlaDuration(start, 2 * 60 * 60_000, "BUSINESS", calendar()).toISOString()
    ).toBe("2026-09-12T05:30:00.000Z");
    expect(
      addSlaDuration(
        start,
        2 * 60 * 60_000,
        "BUSINESS",
        calendar(["2026-09-12"])
      ).toISOString()
    ).toBe("2026-09-13T05:30:00.000Z");
  });

  it("schedules resolution reminders on business days and preserves local time", () => {
    const wednesday = new Date("2026-09-09T06:30:00.000Z");
    expect(addBusinessDays(wednesday, 1, calendar()).toISOString()).toBe("2026-09-12T06:30:00.000Z");
    expect(addBusinessDays(wednesday, 2, calendar(["2026-09-12"])).toISOString()).toBe("2026-09-14T06:30:00.000Z");
  });

  it("measures only effective business time for SLA pause extension", () => {
    expect(
      measureSlaDuration(
        new Date("2026-09-09T12:30:00.000Z"),
        new Date("2026-09-12T05:30:00.000Z"),
        "BUSINESS",
        calendar()
      )
    ).toBe(2 * 60 * 60_000);
  });

  it("calculates exact fractional warning milestones", () => {
    const milestones = calculateSlaMilestones({
      startedAt: new Date("2026-09-12T00:00:00.000Z"),
      targetMinutes: 15,
      clockType: "CALENDAR",
      percentages: [70, 90, 100, 125],
    });
    expect(milestones.map((date) => date.toISOString())).toEqual([
      "2026-09-12T00:10:30.000Z",
      "2026-09-12T00:13:30.000Z",
      "2026-09-12T00:15:00.000Z",
      "2026-09-12T00:18:45.000Z",
    ]);
  });
});
