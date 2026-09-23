import {
  formatJalaliDate,
  formatJalaliDateTime,
  normalizeJalaliDate,
  parseApiDate,
  parseJalaliDateEnd,
  parseJalaliDateTime,
  toJalaliApiPayload,
} from "@/lib/jalali-date";

describe("Jalali date contract", () => {
  it("formats UTC instants in the Persian calendar and Tehran time", () => {
    const instant = new Date("2026-09-15T09:00:00.000Z");
    expect(formatJalaliDate(instant)).toBe("1405/06/24");
    expect(formatJalaliDateTime(instant)).toBe("1405/06/24 12:30:00");
  });

  it("accepts Persian digits and converts them to a UTC instant", () => {
    expect(parseJalaliDateTime("۱۴۰۵/۰۶/۲۴ ۱۲:۳۰:۰۰")?.toISOString()).toBe(
      "2026-09-15T09:00:00.000Z"
    );
    expect(normalizeJalaliDate("۱۴۰۵-۰۶-۲۴")).toBe("1405/06/24");
  });

  it("rejects impossible Jalali dates", () => {
    expect(parseJalaliDateTime("1405/12/30")).toBeNull();
    expect(parseJalaliDateTime("1405/13/01")).toBeNull();
  });

  it("calculates the inclusive end of a Jalali day", () => {
    expect(parseJalaliDateEnd("1405/06/24")?.toISOString()).toBe(
      "2026-09-15T20:29:59.999Z"
    );
  });

  it("serializes dates and ISO strings recursively for API responses", () => {
    expect(
      toJalaliApiPayload({
        createdAt: new Date("2026-09-15T09:00:00.000Z"),
        localDate: "2026-09-15",
        nested: { updatedAt: "2026-09-15T09:00:00.000Z" },
      })
    ).toEqual({
      createdAt: "1405/06/24 12:30:00",
      localDate: "1405/06/24",
      nested: { updatedAt: "1405/06/24 12:30:00" },
    });
  });

  it("keeps ISO input compatibility during the API transition", () => {
    expect(parseApiDate("2026-09-15T09:00:00.000Z")?.toISOString()).toBe(
      "2026-09-15T09:00:00.000Z"
    );
  });
});
